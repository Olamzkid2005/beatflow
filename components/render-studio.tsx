"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { StarterBackgrounds } from "@/components/ui/starter-backgrounds";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  cn,
  Field,
  Input,
  Progress,
  Select,
  StatusDot,
} from "@/components/ui/primitives";
import type { AnalysisMode } from "@/lib/renderer/audio-analysis";
import type { AudioFeatureTable } from "@/lib/renderer/audio-features";
import { resolveTrackName, type DecodedAudio } from "@/lib/renderer/audio";
import type { GraphicSettings } from "@/lib/renderer/graphics";
import { ORBITAL_BOUNDS, ORBITAL_DEFAULTS } from "@/lib/renderer/graphics";
import type { PreparedScene } from "@/lib/renderer/scene";
import type { RenderCapabilities, RenderProgress } from "@/lib/renderer";
import {
  fileIdentity,
  isRenderStale,
  renderSignature,
} from "@/lib/render-signature";
import { DEFAULT_TEMPLATE_ID, ORBITAL_TEMPLATE_ID, TEMPLATE_PRESETS, MUSICAL_KEYS, buildOrbitalTemplate } from "@/lib/templates";
import { useBeforeUnloadWarning } from "@/lib/use-before-unload";
import { useNavigationGuard } from "@/lib/use-navigation-guard";

type Phase = "idle" | "rendering" | "done" | "cancelled" | "error";

type RenderResult = {
  url: string;
  bytes: number;
  name: string;
  /** Identifies the render that owns the upload handoff. */
  artifactId: string;
  title: string;
};

type AnalysisState = {
  status: "idle" | "analyzing" | "ready" | "error";
  source?: File;
  mode?: AnalysisMode;
  message?: string;
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
    case "analyze":
      return "Analyzing the track";
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

/** Native range control with a visible value, used by the Orbital appearance and motion controls. */
function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  display,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.14em] text-on-surface-variant">
          {label}
        </label>
        <span className="font-mono text-[11px] text-outline">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-[var(--color-primary)] disabled:opacity-50"
      />
    </div>
  );
}

export function RenderStudio({
  producerName,
  uploading,
  onRenderedFile,
  onReleaseArtifact,
  onSourceChange,
}: {
  producerName: string;
  uploading: boolean;
  onRenderedFile: (
    file: File,
    artifactId: string,
    title: string,
    /** Musical details the upload desk can use in its description template. */
    details: { bpm?: string; key?: string },
  ) => void;
  onReleaseArtifact: (artifactId: string) => void;
  onSourceChange: (title: string) => void;
}) {
  const [presetId, setPresetId] = useState(DEFAULT_TEMPLATE_ID);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [trackName, setTrackName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  /** Signature of the inputs the finished MP4 was encoded from. */
  const [renderedSignature, setRenderedSignature] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<RenderCapabilities | null>(null);
  const [imageVersion, setImageVersion] = useState(0);

  // Orbital audio-reactive settings. These are part of the scene, not the
  // release content, so analysis is reused when only appearance changes.
  const [graphicSettings, setGraphicSettings] = useState<GraphicSettings>(ORBITAL_DEFAULTS);
  const [bpm, setBpm] = useState("");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [analysisPct, setAnalysisPct] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const bitmapRef = useRef<{ file: File; bitmap: ImageBitmap } | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const resultBlobRef = useRef<Blob | null>(null);

  const preparedRef = useRef<PreparedScene | null>(null);
  const rendererRef = useRef<typeof import("@/lib/renderer") | null>(null);
  const decodedRef = useRef<DecodedAudio | null>(null);
  const featuresRef = useRef<AudioFeatureTable | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const analysisGenerationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  const preset = TEMPLATE_PRESETS.find((option) => option.id === presetId) ?? TEMPLATE_PRESETS[0];
  const animated = preset.id === ORBITAL_TEMPLATE_ID;

  // The animated scene is rebuilt from its settings; text boxes stay fixed.
  const template = useMemo(
    () =>
      animated
        ? buildOrbitalTemplate(graphicSettings, { withImage: Boolean(imageFile) })
        : preset.template,
    [animated, preset.template, graphicSettings, imageFile],
  );

  // Without an animated selection and a track there is nothing to analyze, so
  // the idle state is derived rather than written back from an effect.
  const analysisState: AnalysisState = animated && audioFile && analysis.source === audioFile ? analysis : { status: "idle" };

  const bpmValid =
    bpm.trim() === "" ||
    (Number.isFinite(Number(bpm)) && Number(bpm) >= 20 && Number(bpm) <= 300);
  const bpmValue = bpmValid && bpm.trim() !== "" ? bpm.trim() : undefined;
  const needsImage = template.layers.some((layer) => layer.type === "image");

  // Everything that changes the encoded video. Comparing it with the signature
  // captured at the last successful render tells the user whether the MP4 in
  // hand still matches the preview, without ever discarding that MP4.
  const currentSignature = useMemo(
    () =>
      renderSignature({
        templateId: preset.id,
        appearance: JSON.stringify(graphicSettings),
        producerName,
        trackName: audioFile ? resolveTrackName(trackName, audioFile.name) : "",
        message: message.trim(),
        bpm: bpmValue ?? null,
        key: key || null,
        audio: fileIdentity(audioFile),
        image: fileIdentity(imageFile),
        outputProfile: animated ? "animated" : "static",
      }),
    [
      preset.id,
      graphicSettings,
      producerName,
      trackName,
      audioFile,
      message,
      bpmValue,
      key,
      imageFile,
      animated,
    ],
  );
  const stale = isRenderStale(renderedSignature, currentSignature);

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

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Draws the frame for the media's current time. Reads refs only, so it never
  // updates React state per animation frame.
  const drawCurrentFrame = useCallback(() => {
    const renderer = rendererRef.current;
    const prepared = preparedRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !prepared || !canvas) return;
    const time = audioElementRef.current?.currentTime ?? 0;
    const table = featuresRef.current;
    renderer.drawPreparedFrame(canvas, prepared, {
      timeSeconds: time,
      durationSeconds: decodedRef.current?.duration ?? 0,
      features: table ? renderer.sampleFeatures(table, time) : undefined,
    });
  }, []);

  const startAnimation = useCallback(() => {
    stopAnimation();
    const step = () => {
      drawCurrentFrame();
      animationFrameRef.current = requestAnimationFrame(step);
    };
    animationFrameRef.current = requestAnimationFrame(step);
  }, [drawCurrentFrame, stopAnimation]);

  // Decode and analyze the selected track once per animated selection. The
  // same decoded buffer and feature table are handed to the export, so the
  // track is never decoded twice.
  useEffect(() => {
    if (!animated || !audioFile) {
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = null;
      analysisGenerationRef.current += 1;
      decodedRef.current = null;
      featuresRef.current = null;
      drawCurrentFrame();
      return;
    }

    const generation = analysisGenerationRef.current + 1;
    analysisGenerationRef.current = generation;
    const controller = new AbortController();
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = controller;
    let cancelled = false;

    void (async () => {
      const renderer = await import("@/lib/renderer");
      if (cancelled || generation !== analysisGenerationRef.current) return;
      setAnalysis({ status: "analyzing", source: audioFile });
      setAnalysisPct(0);
      const decoded = await renderer.decodeAudioFile(audioFile, renderer.ANIMATED_MAX_SECONDS);
      if (cancelled || generation !== analysisGenerationRef.current) return;
      const result = await renderer.analyzeAudio(decoded.buffer, {
        signal: controller.signal,
        onProgress: (pct) => {
          if (!cancelled && generation === analysisGenerationRef.current) setAnalysisPct(pct);
        },
      });
      if (cancelled || generation !== analysisGenerationRef.current) return;
      decodedRef.current = decoded;
      featuresRef.current = result.table;
      setAnalysis({ status: "ready", source: audioFile, mode: result.mode });
      setAnalysisPct(1);
      drawCurrentFrame();
    })().catch((reason) => {
      if (cancelled || generation !== analysisGenerationRef.current) return;
      if (reason instanceof Error && reason.name === "AbortError") return;
      decodedRef.current = null;
      featuresRef.current = null;
      setAnalysis({
        status: "error",
        source: audioFile,
        message: reason instanceof Error ? reason.message : "The track could not be analyzed.",
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [animated, audioFile, drawCurrentFrame]);

  // The preset is snapshotted into a prepared scene once per content/appearance
  // snapshot: measured text runs and seeded graphic geometry, shared by preview
  // and export.
  useEffect(() => {
    let cancelled = false;
    preparedRef.current = null;
    void (async () => {
      const renderer = await import("@/lib/renderer");
      if (cancelled) return;
      await renderer.ensureTemplateFonts(template);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const prepared = renderer.prepareScene(
        context,
        template,
        {
          track_name: audioFile ? resolveTrackName(trackName, audioFile.name) : "Track title",
          producer_name: producerName,
          filename: audioFile?.name ?? "",
          message_text: message.trim() || undefined,
          bpm: bpmValue,
          key: key || undefined,
        },
        { background: bitmapRef.current?.bitmap },
      );
      if (cancelled) return;
      rendererRef.current = renderer;
      preparedRef.current = prepared;
      drawCurrentFrame();
    })().catch((reason) => {
      if (!cancelled) {
        setError(
          reason instanceof Error ? reason.message : "The preview could not be prepared.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    template,
    trackName,
    producerName,
    audioFile,
    bpmValue,
    key,
    message,
    imageVersion,
    analysis.status,
    drawCurrentFrame,
  ]);

  // The preview pairs the canvas with the original MP3 (spec section 5). The
  // object URL is created when the file is chosen, replaced when it changes,
  // and revoked on unmount, so no preview URL outlives its file.
  function selectAudioFile(file: File | null) {
    stopAnimation();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = file ? URL.createObjectURL(file) : null;
    setAudioUrl(audioUrlRef.current);
    analysisAbortRef.current?.abort();
    analysisGenerationRef.current += 1;
    decodedRef.current = null;
    featuresRef.current = null;
    setAnalysis({ status: "idle", source: file ?? undefined });
    setAnalysisPct(0);
    setAudioFile(file);
    const nextTitle = file ? trackNameFromFileName(file.name) : "";
    setTrackName(nextTitle);
    onSourceChange(nextTitle);
    setBpm("");
    setKey("");
  }

  // Decode the background once per file and reuse it (memory rule in section 5).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!imageFile) {
        bitmapRef.current?.bitmap.close();
        bitmapRef.current = null;
        if (!cancelled) setImageVersion((value) => value + 1);
        return;
      }
      try {
        const renderer = await import("@/lib/renderer");
        const bitmap = await renderer.decodeImageFile(imageFile);
        if (cancelled) {
          bitmap.close();
          return;
        }
        bitmapRef.current?.bitmap.close();
        bitmapRef.current = { file: imageFile, bitmap };
        setImageError(null);
        setImageVersion((value) => value + 1);
      } catch (reason) {
        if (!cancelled) {
          // A photo that cannot be decoded must block the render, not fail it later.
          setImageError(
            reason instanceof Error ? reason.message : "Could not read that image. Try a PNG or JPEG.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageFile]);

  // Release everything this component created when it unmounts.
  useEffect(
    () => () => {
      stopAnimation();
      abortRef.current?.abort();
      analysisAbortRef.current?.abort();
      analysisGenerationRef.current += 1;
      bitmapRef.current?.bitmap.close();
      bitmapRef.current = null;
      resultBlobRef.current = null;
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    },
    [stopAnimation],
  );

  /** Releases the rendered MP4 without touching anything the user downloaded. */
  function handleDiscard() {
    if (uploading) return;
    if (!window.confirm("Discard this render? The file is released from memory; a downloaded copy is untouched.")) {
      return;
    }
    if (result) onReleaseArtifact(result.artifactId);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    resultBlobRef.current = null;
    setResult(null);
    setRenderedSignature(null);
    setPhase("idle");
  }

  function updateGraphicSettings(patch: Partial<GraphicSettings>) {
    setGraphicSettings((current) => ({ ...current, ...patch }));
  }

  function updateMotion(patch: Partial<GraphicSettings["motion"]>) {
    setGraphicSettings((current) => ({ ...current, motion: { ...current.motion, ...patch } }));
  }

  function shufflePattern() {
    const seed =
      typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 0xffffffff);
    updateGraphicSettings({ seed });
  }

  async function handleRender() {
    if (uploading || !audioFile || phase === "rendering") return;
    if (capabilities && !capabilities.supported) {
      setError(capabilities.reasons.join(" "));
      return;
    }
    if (imageError) return;
    if (needsImage && !imageFile) {
      setError(
        "This template needs a background image. Choose a photo, use a starter background, or switch to Orbital.",
      );
      return;
    }
    if (!bpmValid) {
      setError("BPM must be between 20 and 300, or left empty.");
      return;
    }
    if (animated && analysisState.status !== "ready") {
      setError(
        analysisState.status === "analyzing"
          ? "The track is still being analyzed. Rendering starts once analysis finishes."
          : "Add an MP3 and wait for the track analysis before rendering Orbital.",
      );
      return;
    }
    // A re-render keeps the finished MP4 until the new file is ready, so a
    // failed or cancelled attempt never costs the user their previous render.
    const previous = result;
    const signature = currentSignature;
    setError(null);
    setProgress({ stage: "capabilities", pct: 0 });
    setPhase("rendering");
    stopAnimation();

    const controller = new AbortController();
    abortRef.current = controller;
    const resolvedName = resolveTrackName(trackName, audioFile.name);

    try {
      const renderer = await import("@/lib/renderer");
      const blob = await renderer.renderVideo(
        {
          audio: audioFile,
          background: imageFile ?? undefined,
          template,
          vars: {
            track_name: resolvedName,
            producer_name: producerName,
            filename: audioFile.name,
            message_text: message.trim() || undefined,
            bpm: bpmValue,
            key: key || undefined,
          },
        },
        {
          fps: animated ? renderer.ANIMATED_FPS : undefined,
          decodedAudio: animated ? (decodedRef.current ?? undefined) : undefined,
          features: animated ? (featuresRef.current ?? undefined) : undefined,
          signal: controller.signal,
          onProgress: setProgress,
        },
      );
      controller.signal.throwIfAborted();

      const url = URL.createObjectURL(blob);
      const previousUrl = resultUrlRef.current;
      resultUrlRef.current = url;
      resultBlobRef.current = blob;
      setResult({
        url,
        bytes: blob.size,
        name: `${resolvedName.replace(/[^\w -]+/g, "").trim() || "beatflow-render"}.mp4`,
        artifactId: crypto.randomUUID(),
        title: resolvedName,
      });
      setRenderedSignature(signature);
      setProgress(null);
      setPhase("done");
      if (previous) {
        // The upload desk must not keep pointing at a superseded render.
        onReleaseArtifact(previous.artifactId);
        // Let the <video> swap to the new source before releasing the old URL.
        if (previousUrl) window.setTimeout(() => URL.revokeObjectURL(previousUrl), 1_000);
      }
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
    if (uploading || !blob || !result) return;
    onRenderedFile(new File([blob], result.name, { type: "video/mp4" }), result.artifactId, result.title, {
      bpm: bpmValue,
      key: key || undefined,
    });
  }

  const rendering = phase === "rendering";
  const locked = rendering || uploading;
  const unsupported = capabilities !== null && !capabilities.supported;
  const settingsLocked = locked;
  useBeforeUnloadWarning(rendering || Boolean(result));
  useNavigationGuard(
    !uploading && (rendering || Boolean(result)),
    rendering ? "A render is still running. Leaving this page cancels it. Leave anyway?" : "This rendered MP4 is only in memory. Download or save it before leaving. Leave anyway?",
  );

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            Step 1 · Create video
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">Render a beat video</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-on-surface-variant">
            Pick a visual style, add your beat and artwork, then render a 1080p MP4 in this browser.
          </p>
        </div>
        <Badge tone={unsupported ? "danger" : "primary"}>
          <StatusDot tone={unsupported ? "danger" : "primary"} />
          {unsupported ? "Renderer unavailable" : animated ? "30 fps · Audio-reactive" : "1080p · Ready"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
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
            {animated ? " · 30 fps" : ""}
          </p>
          {stale ? (
            <p
              role="status"
              className="rounded-lg border border-tertiary/35 bg-tertiary-container/10 px-3 py-2 text-xs leading-5 text-on-surface-variant"
            >
              <span className="font-medium text-tertiary">Preview updated.</span> The MP4 below
              still shows your last render. Press {animated ? "Render MP4 · 30 fps" : "Render MP4"} to
              replace it — the current file stays available until the new one finishes.
            </p>
          ) : null}
          {animated && analysisState.status !== "ready" ? (
            <p className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest/70 px-3 py-2 text-xs leading-5 text-on-surface-variant">
              {analysisState.status === "analyzing"
                ? `Analyzing the track — ${Math.round(analysisPct * 100)}%. The design is shown still until analysis finishes.`
                : analysisState.status === "error"
                  ? "The track could not be analyzed. Choose another MP3 to unlock the 30 fps render."
                  : "Design preview — add audio for reactive motion."}
            </p>
          ) : null}

          {audioUrl ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-outline-variant/70 bg-surface-container-lowest/70 px-3 py-2.5">
              <audio
                key={audioUrl}
                ref={audioElementRef}
                src={audioUrl}
                controls
                preload="metadata"
                aria-label={`Preview source audio: ${audioFile?.name ?? "track"}`}
                className="w-full"
                onPlay={() => {
                  if (animated) startAnimation();
                }}
                onPause={() => {
                  stopAnimation();
                  drawCurrentFrame();
                }}
                onEnded={() => {
                  stopAnimation();
                  drawCurrentFrame();
                }}
                onSeeked={drawCurrentFrame}
                onLoadedMetadata={drawCurrentFrame}
                onTimeUpdate={() => {
                  if (audioElementRef.current?.paused) drawCurrentFrame();
                }}
              />
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-outline">
                Source audio · {audioFile?.name ?? "track"}
              </p>
            </div>
          ) : null}

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
              {result ? (
                <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                  Your current MP4 stays available until this render replaces it.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-xl border border-error/25 bg-error-container/15 p-4">
              <p className="text-sm font-medium text-error">Render issue</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{error}</p>
              <p className="mt-1 text-xs leading-5 text-outline">
                {result
                  ? "Your previous MP4 is unchanged and still ready to download or upload."
                  : "Rendering uploads nothing and changes no files, so it is always safe to try again with different inputs."}
              </p>
            </div>
          ) : null}

          {phase === "cancelled" && !error ? (
            <div className="rounded-xl border border-outline-variant/70 bg-surface-container-lowest/70 p-4 text-sm text-on-surface-variant">
              {result
                ? "Render cancelled. Your previous MP4 is unchanged — adjust the inputs and render again when you are ready."
                : "Render cancelled. Nothing was kept — adjust the inputs and render again."}
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
                <Button size="sm" onClick={handleUseForUpload} disabled={locked}>
                  <Icon name="upload" className="h-3.5 w-3.5" />
                  Use for upload
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={locked}>
                  <Icon name="trash" className="h-3.5 w-3.5" />
                  Discard
                </Button>
                <Badge tone={stale ? "tertiary" : "success"}>
                  {stale ? "MP4 · previous settings" : "MP4 · matches preview"}
                </Badge>
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
            data-tour="render-template"
            className="flex flex-col gap-1.5"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-on-surface-variant">
              Visual style
            </span>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_PRESETS.map((option) => {
                const selected = option.id === preset.id;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50",
                      locked && "cursor-not-allowed opacity-50",
                      selected
                        ? "border-primary/50 bg-primary/10"
                        : "border-outline-variant bg-surface-container-lowest/60 hover:border-outline hover:bg-surface-container-high/60",
                    )}
                  >
                    <input
                      type="radio"
                      name="render-template"
                      value={option.id}
                      checked={selected}
                      disabled={locked}
                      onChange={() => {
                        stopAnimation();
                        analysisAbortRef.current?.abort();
                        analysisGenerationRef.current += 1;
                        decodedRef.current = null;
                        featuresRef.current = null;
                        setAnalysis({ status: "idle" });
                        setPresetId(option.id);
                      }}
                      className="sr-only"
                    />
                    <span className="flex items-center justify-between gap-1 text-sm font-medium">
                      {option.template.name}
                      {selected ? <Icon name="check" className="h-3.5 w-3.5 text-primary" /> : null}
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-4 text-on-surface-variant">
                      {option.description}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <Field label="Track MP3" htmlFor="render-audio" hint={animated ? "max 5 min" : "max 15 min"}>
            <Input
              id="render-audio"
              type="file"
              accept=".mp3,audio/mpeg,.wav,audio/wav"
              disabled={locked}
              onChange={(event) => {
                selectAudioFile(event.target.files?.[0] ?? null);
              }}
            />
          </Field>

          <Field
            label={needsImage ? "Background image" : "Background image (optional)"}
            htmlFor="render-image"
            hint={needsImage ? "1920 × 1080" : "optional backdrop"}
          >
            <Input
              id="render-image"
              type="file"
              accept="image/*"
              disabled={locked}
              onChange={(event) => {
                setImageError(null);
                setImageFile(event.target.files?.[0] ?? null);
              }}
            />
          </Field>

          <StarterBackgrounds
            disabled={locked}
            className={needsImage && !imageFile ? "rounded-xl border border-outline-variant/60 bg-surface-container-lowest/60 p-3" : undefined}
            onSelect={(file) => {
              setImageError(null);
              setImageFile(file);
            }}
          />

          {imageError ? (
            <p role="alert" className="rounded-lg border border-error/25 bg-error-container/15 px-3 py-2 text-xs leading-5 text-error">
              {imageError} Choose a different image to unlock rendering.
            </p>
          ) : null}

          <Field label="Track name" htmlFor="render-track-name" hint="shown in video">
            <Input
              id="render-track-name"
              value={trackName}
              disabled={locked}
              placeholder="Midnight Loop"
              onChange={(event) => {
                setTrackName(event.target.value);
              }}
            />
          </Field>

          {animated ? (
            <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-lowest/60 p-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="BPM" htmlFor="render-bpm" hint="optional">
                  <Input
                    id="render-bpm"
                    inputMode="decimal"
                    value={bpm}
                    disabled={locked}
                    placeholder="128"
                    aria-invalid={!bpmValid}
                    onChange={(event) => setBpm(event.target.value)}
                  />
                </Field>
                <Field label="Key" htmlFor="render-key" hint="optional">
                  <Select
                    id="render-key"
                    value={key}
                    disabled={locked}
                    onChange={(event) => setKey(event.target.value)}
                  >
                    <option value="">Not set</option>
                    {MUSICAL_KEYS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {!bpmValid ? (
                <p role="alert" className="text-xs leading-5 text-error">
                  BPM must be between 20 and 300, or empty.
                </p>
              ) : null}

              <Field label="Message" htmlFor="render-message" hint="optional">
                <Input
                  id="render-message"
                  value={message}
                  maxLength={500}
                  disabled={locked}
                  placeholder="Purchase This Track For Commercial Use"
                  onChange={(event) => setMessage(event.target.value)}
                />
              </Field>

              <details open className="group border-t border-outline-variant/60 pt-3">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg text-[11px] font-medium uppercase tracking-[0.14em] text-on-surface-variant transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  <span>Orbital appearance &amp; motion</span>
                  <Icon name="chevronDown" className="h-4 w-4 text-outline transition group-open:rotate-180" />
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-on-surface-variant">Pattern</span>
                    <Button variant="ghost" size="sm" onClick={shufflePattern} disabled={settingsLocked}>
                      <Icon name="spark" className="h-3.5 w-3.5" />
                      Shuffle pattern
                    </Button>
                  </div>

                  <RangeControl
                    id="orbital-rings"
                    label="Rings"
                    value={graphicSettings.ringCount}
                    min={ORBITAL_BOUNDS.ringCount.min}
                    max={ORBITAL_BOUNDS.ringCount.max}
                    step={1}
                    disabled={settingsLocked}
                    display={String(graphicSettings.ringCount)}
                    onChange={(value) => updateGraphicSettings({ ringCount: value })}
                  />
                  <RangeControl
                    id="orbital-particles"
                    label="Particles"
                    value={graphicSettings.particleCount}
                    min={ORBITAL_BOUNDS.particleCount.min}
                    max={ORBITAL_BOUNDS.particleCount.max}
                    step={50}
                    disabled={settingsLocked}
                    display={String(graphicSettings.particleCount)}
                    onChange={(value) => updateGraphicSettings({ particleCount: value })}
                  />
                  <RangeControl
                    id="orbital-tilt"
                    label="Tilt"
                    value={graphicSettings.tiltDeg}
                    min={ORBITAL_BOUNDS.tiltDeg.min}
                    max={ORBITAL_BOUNDS.tiltDeg.max}
                    step={1}
                    disabled={settingsLocked}
                    display={`${graphicSettings.tiltDeg}°`}
                    onChange={(value) => updateGraphicSettings({ tiltDeg: value })}
                  />

                  <div className="flex items-center justify-between gap-2 border-t border-outline-variant/60 pt-3">
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-on-surface-variant">
                      Motion
                    </span>
                    <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <input
                        type="checkbox"
                        checked={graphicSettings.motion.enabled}
                        disabled={settingsLocked}
                        onChange={(event) => updateMotion({ enabled: event.target.checked })}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      React to audio
                    </label>
                  </div>
                  <RangeControl
                    id="orbital-sensitivity"
                    label="Sensitivity"
                    value={graphicSettings.motion.sensitivity}
                    min={ORBITAL_BOUNDS.sensitivity.min}
                    max={ORBITAL_BOUNDS.sensitivity.max}
                    step={0.05}
                    disabled={settingsLocked || !graphicSettings.motion.enabled}
                    display={graphicSettings.motion.sensitivity.toFixed(2)}
                    onChange={(value) => updateMotion({ sensitivity: value })}
                  />
                  <RangeControl
                    id="orbital-rotation"
                    label="Rotation"
                    value={graphicSettings.motion.rotationRpm}
                    min={ORBITAL_BOUNDS.rotationRpm.min}
                    max={ORBITAL_BOUNDS.rotationRpm.max}
                    step={0.25}
                    disabled={settingsLocked || !graphicSettings.motion.enabled}
                    display={`${graphicSettings.motion.rotationRpm} rpm`}
                    onChange={(value) => updateMotion({ rotationRpm: value })}
                  />
                  <RangeControl
                    id="orbital-pulse"
                    label="Max pulse"
                    value={graphicSettings.motion.maxPulse}
                    min={ORBITAL_BOUNDS.maxPulse.min}
                    max={ORBITAL_BOUNDS.maxPulse.max}
                    step={0.005}
                    disabled={settingsLocked || !graphicSettings.motion.enabled}
                    display={graphicSettings.motion.maxPulse.toFixed(3)}
                    onChange={(value) => updateMotion({ maxPulse: value })}
                  />
                </div>
              </details>

              <p
                className="text-xs leading-5 text-on-surface-variant"
                role="status"
                aria-live="polite"
              >
                {analysisState.status === "ready"
                  ? `Track analyzed ${analysis.mode === "worker" ? "in a background worker" : "on this tab"}. Preview follows the source audio.`
                  : analysisState.status === "analyzing"
                    ? `Analyzing the track — ${Math.round(analysisPct * 100)}%.`
                    : analysisState.status === "error"
                      ? (analysisState.message ?? "The track could not be analyzed.")
                      : "Add an MP3 to analyze the track and unlock reactive motion."}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              data-tour="render-button"
              onClick={handleRender}
              disabled={
                !audioFile ||
                (needsImage && !imageFile) ||
                locked ||
                unsupported ||
                Boolean(imageError) ||
                !bpmValid ||
                (animated && analysisState.status !== "ready")
              }
            >
              <Icon name="spark" className="h-4 w-4" />
              {rendering
                ? "Rendering…"
                : animated
                  ? "Render MP4 · 30 fps"
                  : "Render MP4"}
            </Button>
            {uploading ? (
              <span className="text-xs leading-5 text-on-surface-variant">
                Upload in progress — render controls are locked until it finishes.
              </span>
            ) : null}
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
            Editing updates this preview immediately; the MP4 changes only when you render, and a
            re-render keeps the current file until the new one is ready.
            {animated
              ? " Orbital renders at 30 fps with a 5-minute limit."
              : " Rendering never uploads anything."}
          </p>
        </div>
      </div>
    </Card>
  );
}
