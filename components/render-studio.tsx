"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  cn,
  Field,
  Input,
  Progress,
  StatusDot,
} from "@/components/ui/primitives";
import type { RenderCapabilities, RenderProgress } from "@/lib/renderer";
import { DEFAULT_TEMPLATE_ID, TEMPLATE_PRESETS } from "@/lib/templates";
import { useBeforeUnloadWarning } from "@/lib/use-before-unload";

type Phase = "idle" | "rendering" | "done" | "cancelled" | "error";

type RenderResult = {
  url: string;
  bytes: number;
  name: string;
};

function trackNameFromFileName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled"
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function stageLabel(stage: RenderProgress["stage"]): string {
  switch (stage) {
    case "capabilities":
      return "Checking browser support";
    case "decode":
      return "Decoding audio";
    case "assets":
      return "Loading artwork and fonts";
    case "video":
      return "Encoding video frames";
    case "audio":
      return "Encoding audio";
    case "finalize":
      return "Finalizing MP4";
  }
}

export function RenderStudio({
  producerName,
  onRenderedFile,
}: {
  producerName: string;
  onRenderedFile: (file: File) => void;
}) {
  const [presetId, setPresetId] = useState(DEFAULT_TEMPLATE_ID);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [trackName, setTrackName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<RenderCapabilities | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bitmapRef = useRef<{ file: File; bitmap: ImageBitmap } | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const resultBlobRef = useRef<Blob | null>(null);

  // Capability check at startup (spec section 5 step 1).
  useEffect(() => {
    let cancelled = false;
    import("@/lib/renderer")
      .then((renderer) => renderer.checkRenderCapabilities())
      .then((value) => {
        if (!cancelled) setCapabilities(value);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not check browser support.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The decoded bitmap lives in a ref, so editing text redraws without
  // re-decoding the photo (memory rule in section 5).
  const drawPreviewRef = useRef<() => Promise<void>>(async () => {});

  // The preset is snapshotted here, so switching it mid-render cannot change
  // the frames an in-flight export already produced (spec section 6).
  const preset = TEMPLATE_PRESETS.find((option) => option.id === presetId) ?? TEMPLATE_PRESETS[0];
  const template = preset.template;

  // Live preview: same drawScene the export uses, no encoding (spec section 5).
  useEffect(() => {
    drawPreviewRef.current = async () => {
      const renderer = await import("@/lib/renderer");
      await renderer.ensureTemplateFonts(template);
      const canvas = canvasRef.current;
      if (!canvas) return;
      renderer.previewFrame(
        canvas,
        template,
        {
          track_name: trackName || "Track title",
          producer_name: producerName,
          filename: audioFile?.name ?? "",
        },
        { background: bitmapRef.current?.bitmap },
      );
    };
    drawPreviewRef.current().catch(() => {});
  }, [template, trackName, producerName, audioFile]);

  // Decode the background once per file and reuse it (memory rule in section 5).
  useEffect(() => {
    if (!imageFile) {
      bitmapRef.current?.bitmap.close();
      bitmapRef.current = null;
      drawPreviewRef.current().catch(() => {});
      return;
    }
    let cancelled = false;
    import("@/lib/renderer")
      .then(async (renderer) => {
        const bitmap = await renderer.decodeImageFile(imageFile);
        if (cancelled) {
          bitmap.close();
          return;
        }
        bitmapRef.current?.bitmap.close();
        bitmapRef.current = { file: imageFile, bitmap };
        setImageError(null);
        await drawPreviewRef.current();
      })
      .catch((reason) => {
        if (!cancelled) {
          // A photo that cannot be decoded must block the render, not fail it later.
          setImageError(
            reason instanceof Error ? reason.message : "Could not read that image. Try a PNG or JPEG.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [imageFile]);

  // Release everything this component created when it unmounts.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      bitmapRef.current?.bitmap.close();
      bitmapRef.current = null;
      resultBlobRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    },
    [],
  );

  /** Releases the rendered MP4 without touching anything the user downloaded. */
  function handleDiscard() {
    if (!window.confirm("Discard this render? The file is released from memory; a downloaded copy is untouched.")) {
      return;
    }
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    resultBlobRef.current = null;
    setResult(null);
    setPhase("idle");
  }

  async function handleRender() {
    if (!audioFile || !imageFile || phase === "rendering") return;
    if (capabilities && !capabilities.supported) {
      setError(capabilities.reasons.join(" "));
      return;
    }
    if (imageError) return;
    // Hold on to a finished render until the user agrees to replace it.
    if (result && !window.confirm("Start a new render and release the current MP4?")) return;

    // A new render releases the previous Blob and URL (spec section 5 cleanup).
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    resultBlobRef.current = null;
    setResult(null);
    setError(null);
    setProgress({ stage: "capabilities", pct: 0 });
    setPhase("rendering");

    const controller = new AbortController();
    abortRef.current = controller;
    const resolvedName = trackName.trim() || trackNameFromFileName(audioFile.name);

    try {
      const renderer = await import("@/lib/renderer");
      const blob = await renderer.renderVideo(
        {
          audio: audioFile,
          background: imageFile,
          template,
          vars: {
            track_name: resolvedName,
            producer_name: producerName,
            filename: audioFile.name,
          },
        },
        { signal: controller.signal, onProgress: setProgress },
      );
      controller.signal.throwIfAborted();

      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      resultBlobRef.current = blob;
      setResult({
        url,
        bytes: blob.size,
        name: `${resolvedName.replace(/[^\w -]+/g, "").trim() || "beatflow-render"}.mp4`,
      });
      setProgress(null);
      setPhase("done");
    } catch (renderError) {
      if (controller.signal.aborted) {
        setPhase("cancelled");
      } else {
        setError(renderError instanceof Error ? renderError.message : "The render failed.");
        setPhase("error");
      }
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  }

  function handleUseForUpload() {
    const blob = resultBlobRef.current;
    if (!blob || !result) return;
    onRenderedFile(new File([blob], result.name, { type: "video/mp4" }));
  }

  const rendering = phase === "rendering";
  const unsupported = capabilities !== null && !capabilities.supported;
  useBeforeUnloadWarning(rendering);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
            <span>Studio</span>
            <span aria-hidden>/</span>
            <span className="text-on-surface">Render</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">Render a beat video</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-on-surface-variant">
            Pick a template, then add an MP3 and a background photo. The render happens in this
            browser and produces a 1080p MP4 ready to download or send to the upload desk.
          </p>
        </div>
        <Badge tone={unsupported ? "danger" : "primary"}>
          <StatusDot tone={unsupported ? "danger" : "primary"} />
          {unsupported ? "Renderer unavailable" : "M2 · Template engine"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest">
            <canvas
              ref={canvasRef}
              width={template.canvas.width}
              height={template.canvas.height}
              aria-label="Rendered video preview"
              className="h-auto w-full"
            />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-outline">
            Preview · {template.name} template · {template.canvas.width} × {template.canvas.height}
          </p>

          {rendering && progress ? (
            <div className="rounded-xl border border-outline-variant/70 bg-surface-container-lowest/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{stageLabel(progress.stage)}</p>
                <span className="font-mono text-[11px] text-outline">
                  {Math.round(progress.pct * 100)}%
                </span>
              </div>
              <Progress
                className="mt-3"
                value={progress.pct * 100}
                label={stageLabel(progress.stage)}
              />
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-xl border border-error/25 bg-error-container/15 p-4">
              <p className="text-sm font-medium text-error">Render issue</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{error}</p>
              <p className="mt-1 text-xs leading-5 text-outline">
                Rendering uploads nothing and changes no files, so it is always safe to try
                again with different inputs.
              </p>
            </div>
          ) : null}

          {phase === "cancelled" && !error ? (
            <div className="rounded-xl border border-outline-variant/70 bg-surface-container-lowest/70 p-4 text-sm text-on-surface-variant">
              Render cancelled. Nothing was kept — adjust the inputs and render again.
            </div>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-3">
              <video
                src={result.url}
                controls
                playsInline
                className="w-full rounded-xl border border-outline-variant/70 bg-surface-container-lowest"
              />
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={result.url}
                  download={result.name}
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  <Icon name="download" className="h-3.5 w-3.5" />
                  Download MP4
                </a>
                <Button size="sm" onClick={handleUseForUpload}>
                  <Icon name="upload" className="h-3.5 w-3.5" />
                  Use for upload
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDiscard}>
                  <Icon name="trash" className="h-3.5 w-3.5" />
                  Discard
                </Button>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-outline">
                  {result.name} · {formatBytes(result.bytes)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <div
            role="radiogroup"
            aria-label="Template"
            className="flex flex-col gap-1.5"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-on-surface-variant">
              Template
            </span>
            <div className="flex flex-col gap-2">
              {TEMPLATE_PRESETS.map((option) => {
                const selected = option.id === preset.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={rendering}
                    onClick={() => setPresetId(option.id)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-primary/50 bg-primary/10"
                        : "border-outline-variant bg-surface-container-lowest/60 hover:border-outline hover:bg-surface-container-high/60",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {option.template.name}
                      {selected ? <Icon name="check" className="h-3.5 w-3.5 text-primary" /> : null}
                    </span>
                    <span className="text-xs leading-5 text-on-surface-variant">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Track MP3" htmlFor="render-audio" hint="max 15 min">
            <Input
              id="render-audio"
              type="file"
              accept=".mp3,audio/mpeg"
              disabled={rendering}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setAudioFile(file);
                if (file) setTrackName((current) => current || trackNameFromFileName(file.name));
              }}
            />
          </Field>

          <Field label="Background image" htmlFor="render-image" hint="downscaled to 1920 px">
            <Input
              id="render-image"
              type="file"
              accept="image/*"
              disabled={rendering}
              onChange={(event) => {
                setImageError(null);
                setImageFile(event.target.files?.[0] ?? null);
              }}
            />
          </Field>

          {imageError ? (
            <p role="alert" className="rounded-lg border border-error/25 bg-error-container/15 px-3 py-2 text-xs leading-5 text-error">
              {imageError} Choose a different image to unlock rendering.
            </p>
          ) : null}

          <Field label="Track name" htmlFor="render-track-name" hint="shown in the video">
            <Input
              id="render-track-name"
              value={trackName}
              disabled={rendering}
              placeholder="Midnight Loop"
              onChange={(event) => setTrackName(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleRender}
              disabled={!audioFile || !imageFile || rendering || unsupported || Boolean(imageError)}
            >
              <Icon name="spark" className="h-4 w-4" />
              {rendering ? "Rendering…" : "Render MP4"}
            </Button>
            {rendering ? (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                <Icon name="close" className="h-4 w-4" />
                Cancel
              </Button>
            ) : null}
          </div>

          {unsupported && capabilities ? (
            <div role="alert" className="rounded-xl border border-error/25 bg-error-container/15 p-4">
              <p className="text-sm font-medium text-error">This browser cannot render the video</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs leading-5 text-on-surface-variant">
                {capabilities.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs leading-5 text-on-surface-variant">
            The MP4 stays in memory until the next render. Cancel releases it; nothing is
            uploaded by rendering.
          </p>
        </div>
      </div>
    </Card>
  );
}
