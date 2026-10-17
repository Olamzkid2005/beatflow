"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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
  Select,
  StatusDot,
  Textarea,
} from "@/components/ui/primitives";
import { TagInput } from "@/components/ui/tag-input";
import { addHistoryEntry } from "@/lib/history";
import { readSettings } from "@/lib/settings";
import { browserTimeZone, toDateTimeLocalValue, toUtcIso8601 } from "@/lib/time";
import { useChannel } from "@/lib/use-channel";
import {
  CHUNK_ALIGNMENT,
  DEFAULT_CHUNK_SIZE,
  uploadToResumableSession,
  type UploadProgress,
} from "@/lib/youtube/uploader";

type UploadResult = {
  videoId: string;
  publishAt: string | null;
  privacyStatus: string;
};

const TEST_TITLE = "BeatFlow M0 test — 5 seconds";
const DEFAULT_DESCRIPTION = "M0 pipeline proof for BeatFlow.";
const subscribe = () => () => {};

function defaultSchedule(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 10 * 60 * 1000));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatCount(value: string | null): string {
  if (!value) return "—";
  const count = Number(value);
  if (!Number.isFinite(count)) return value;
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

function formatSchedule(iso: string | null): string {
  if (!iso) return "Immediately";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function GeneratePage() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <UploadStudio /> : <StudioSkeleton />;
}

function StudioSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-container-high" />
        <div className="h-8 w-48 animate-pulse rounded bg-surface-container-high" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-surface-container-high" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="h-80 animate-pulse rounded-2xl border border-surface-container-highest bg-surface-container-low/60" />
        <div className="h-96 animate-pulse rounded-2xl border border-surface-container-highest bg-surface-container-low/60" />
      </div>
    </div>
  );
}

function UploadStudio() {
  const { channel, error: channelError, loading: channelLoading } = useChannel();

  // UploadStudio only mounts after the client-only gate in GeneratePage, so
  // reading local storage in these initializers cannot run during SSR.
  const [defaults] = useState(readSettings);
  const [title, setTitle] = useState(TEST_TITLE);
  const [description, setDescription] = useState(
    () => defaults.descriptionTemplate.trim() || DEFAULT_DESCRIPTION,
  );
  const [tags, setTags] = useState<string[]>(() => [...defaults.defaultTags]);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [timeZone] = useState(() => {
    if (!defaults.timezone) return browserTimeZone();
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: defaults.timezone }).format();
      return defaults.timezone;
    } catch {
      return browserTimeZone();
    }
  });
  const [file, setFile] = useState<File | null>(null);
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE);
  const [dragging, setDragging] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function startUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (abortRef.current) return;

    setError(null);
    setResult(null);
    setProgress(null);

    if (!file) {
      setError("Choose a rendered MP4 before starting the upload.");
      return;
    }
    if (file.size === 0) {
      setError("That file is empty. Choose a different MP4.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title before uploading.");
      return;
    }

    let publishAt: string | null = null;
    try {
      publishAt = schedule ? toUtcIso8601(schedule, timeZone) : null;
      if (publishAt && Date.parse(publishAt) <= Date.now()) {
        throw new Error("Choose a schedule in the future.");
      }
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Invalid schedule.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);

    try {
      const initResponse = await fetch("/api/youtube/init-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        body: JSON.stringify({
          metadata: {
            title,
            description,
            tags,
            // A scheduled upload must be private.
            privacyStatus: publishAt ? "private" : "unlisted",
            publishAt,
          },
          fileSize: file.size,
        }),
      });

      const initBody = await initResponse.json();
      if (!initResponse.ok) {
        const details = Array.isArray(initBody.issues)
          ? initBody.issues
              .map((issue: { message?: string }) => issue.message)
              .filter(Boolean)
              .join(" ")
          : "";
        throw new Error(
          details || initBody.error || `Could not start the upload (${initResponse.status})`,
        );
      }

      controller.signal.throwIfAborted();
      if (typeof initBody.sessionUri !== "string") {
        throw new Error("YouTube did not provide an upload session.");
      }

      const videoId = await uploadToResumableSession({
        sessionUri: initBody.sessionUri,
        file,
        chunkSize,
        signal: controller.signal,
        onProgress: setProgress,
      });

      controller.signal.throwIfAborted();

      const completed: UploadResult = {
        videoId,
        publishAt,
        privacyStatus: publishAt ? "private" : "unlisted",
      };
      setResult(completed);

      try {
        addHistoryEntry({
          videoId,
          title: title.trim(),
          channelTitle: channel?.title ?? null,
          publishAt,
          privacyStatus: completed.privacyStatus,
          createdAt: new Date().toISOString(),
        });
      } catch {
        // History is a convenience; never turn a successful upload into an error.
      }
    } catch (uploadError) {
      if (controller.signal.aborted) {
        setProgress(null);
        setError(
          "Upload cancelled. If YouTube already accepted it, cancellation does not remove the video; check YouTube Studio before uploading again.",
        );
      } else {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const descriptionBytes = new TextEncoder().encode(description).length;
  const oneRequest = Boolean(file && file.size <= chunkSize);
  const channelTone = channelError ? "danger" : channel ? "success" : "neutral";

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
            <span>Studio</span>
            <span aria-hidden>/</span>
            <span className="text-on-surface">New upload</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Prepare the next release
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-variant">
            Choose the rendered MP4, shape the metadata, and send it straight to your channel.
            YouTube handles encoding and publication after the upload.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={channelTone}>
            <StatusDot tone={channelError ? "danger" : channel ? "primary" : "muted"} />
            {channelLoading ? "Checking channel" : channelError ? "Channel offline" : channel ? "Channel connected" : "No channel"}
          </Badge>
          <Link href="/history" className={buttonClass({ variant: "outline", size: "sm" })}>
            <Icon name="history" className="h-3.5 w-3.5" />
            History
          </Link>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {channelLoading ? (
                <>
                  <span className="h-10 w-10 animate-pulse rounded-full bg-surface-container-high" />
                  <div className="flex flex-col gap-2">
                    <span className="h-3.5 w-36 animate-pulse rounded bg-surface-container-high" />
                    <span className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
                  </div>
                </>
              ) : channelError ? (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-error/20 bg-error-container/20 text-error">
                    <Icon name="alert" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Channel unavailable</p>
                    <p className="mt-0.5 truncate text-xs text-on-surface-variant" title={channelError}>
                      {channelError}
                    </p>
                  </div>
                </>
              ) : channel ? (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-high">
                    {channel.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={channel.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="youtube" className="h-4 w-4 text-primary" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{channel.title ?? channel.id}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-outline">
                      {formatCount(channel.subscriberCount)} subscribers ·{" "}
                      {formatCount(channel.videoCount)} videos
                    </p>
                  </div>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2 sm:pl-4">
              <Link href="/" className={buttonClass({ variant: "ghost", size: "sm" })}>
                <Icon name={channelError ? "refresh" : "user"} className="h-3.5 w-3.5" />
                {channelError ? "Reconnect" : "Account"}
              </Link>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="relative">
              <input
                id="video-file"
                type="file"
                accept="video/mp4"
                disabled={busy}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="peer sr-only"
              />
              <label
                htmlFor="video-file"
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (busy) return;
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) setFile(dropped);
                }}
                className={cn(
                  "group relative flex aspect-video cursor-pointer flex-col items-center justify-center overflow-hidden border-b border-surface-container-highest bg-surface-container-lowest text-center outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
                  dragging && "bg-primary/5",
                  busy && "cursor-not-allowed opacity-70",
                )}
              >
                <div aria-hidden className="studio-grid absolute inset-0 opacity-50" />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(148,125,255,0.16),transparent_45%)]"
                />

                <div className="relative flex flex-col items-center gap-4 px-6">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_20px_50px_-24px_rgba(148,125,255,0.9)] transition group-hover:scale-105">
                    <Icon name={file ? "movie" : "upload"} className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="max-w-full break-all text-base font-medium">
                      {file ? file.name : "Drop your rendered MP4 here"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                      {file
                        ? `${formatBytes(file.size)} · ${file.type || "video/mp4"} · ready to upload`
                        : "or click to browse. The M0 proof works best with a 5-second clip."}
                    </p>
                  </div>
                  <span className="rounded-lg border border-outline-variant/70 bg-surface-container-low/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
                    {file ? "Replace file" : "Choose MP4"}
                  </span>
                </div>

                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-outline-variant/60 bg-surface-container-lowest/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-outline">
                  <StatusDot tone={file ? "primary" : "muted"} />
                  {file ? "Ready" : "No source"}
                </div>
                <div className="absolute right-3 top-3 rounded-md border border-outline-variant/60 bg-surface-container-lowest/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-outline">
                  16:9 · MP4
                </div>
                <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-16 items-end justify-center gap-1 px-6 opacity-40">
                  {[9, 18, 12, 26, 16, 34, 22, 42, 28, 18, 31, 14, 24, 11, 19].map((height, index) => (
                    <span
                      key={index}
                      className="w-1 rounded-full bg-linear-to-t from-primary/20 to-primary"
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>
              </label>
            </div>

            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {file ? file.name : "No video selected"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-outline">
                  {file
                    ? `${formatBytes(file.size)} · ${file.type || "video/mp4"}`
                    : "MP4 · 5 seconds recommended for the M0 proof"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="video-file"
                  className={buttonClass({
                    variant: "secondary",
                    size: "sm",
                    className: "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
                  })}
                >
                  <Icon name="folder" className="h-3.5 w-3.5" />
                  {file ? "Replace MP4" : "Choose MP4"}
                </label>
                <a
                  href="/beatflow-m0-test-5s.mp4"
                  download="beatflow-m0-test-5s.mp4"
                  className={buttonClass({ variant: "ghost", size: "sm" })}
                >
                  <Icon name="download" className="h-3.5 w-3.5" />
                  Sample
                </a>
              </div>
            </div>
          </Card>

          {busy || progress ? (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                    Upload progress
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {busy ? "Sending to YouTube" : "Upload complete"}
                  </p>
                </div>
                <span className="font-mono text-lg text-primary">{progress?.percent ?? 0}%</span>
              </div>
              <Progress value={progress?.percent ?? 0} className="mt-4" label="YouTube upload" />
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-outline">
                <span>
                  {formatBytes(progress?.uploadedBytes ?? 0)} of{" "}
                  {formatBytes(progress?.totalBytes ?? file?.size ?? 0)}
                </span>
                <span>{busy ? "Keep this tab open" : "Handed off"}</span>
              </div>
            </Card>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-error/25 bg-error-container/10 p-4 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.9)]"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-error-container/30 text-error">
                  <Icon name="alert" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-error">Upload issue</p>
                  <p className="mt-1 text-sm leading-6 text-on-surface-variant">{error}</p>
                </div>
              </div>
            </div>
          ) : null}

          {result ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.9)] sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                    <Icon name="check" className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-emerald-200">Uploaded to YouTube</p>
                    <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
                      {result.videoId}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                      {result.publishAt
                        ? `Scheduled for ${formatSchedule(result.publishAt)} · ${result.privacyStatus} until then`
                        : `Uploaded as ${result.privacyStatus}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://studio.youtube.com/video/${result.videoId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass({ size: "sm" })}
                  >
                    Open in YouTube Studio
                    <Icon name="external" className="h-3.5 w-3.5" />
                  </a>
                  <Link href="/history" className={buttonClass({ variant: "outline", size: "sm" })}>
                    View history
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

        </div>

        <form id="upload-form" onSubmit={startUpload} className="flex min-w-0 flex-col gap-5">
          <fieldset disabled={busy} className="contents">
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                    Metadata
                  </p>
                  <h2 className="mt-1 text-base font-semibold">Video details</h2>
                </div>
                <Badge tone="neutral">YouTube</Badge>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <Field label="Title" htmlFor="video-title" hint={`${title.length}/100`}>
                  <Input
                    id="video-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={100}
                    placeholder="Name this release"
                  />
                </Field>

                <Field
                  label="Description"
                  htmlFor="video-description"
                  hint={`${descriptionBytes}/5000 bytes`}
                >
                  <Textarea
                    id="video-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder="Tracklist, credits, links…"
                  />
                </Field>

                <Field label="Tags" htmlFor="video-tags" hint="Enter to add">
                  <TagInput
                    id="video-tags"
                    value={tags}
                    onChange={setTags}
                    placeholder="beat, instrumental, type beat…"
                  />
                </Field>
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="calendar" className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                    Release
                  </p>
                  <h2 className="text-base font-semibold">Publishing schedule</h2>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <Field
                  label="Publish at"
                  htmlFor="video-schedule"
                  hint={timeZone}
                >
                  <Input
                    id="video-schedule"
                    type="datetime-local"
                    value={schedule}
                    onChange={(event) => setSchedule(event.target.value)}
                  />
                </Field>
                <p className="text-xs leading-5 text-on-surface-variant">
                  Sent as UTC ISO 8601 and kept private until publication. Clear the field to
                  upload as unlisted immediately.
                </p>

                <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-on-surface-variant">Privacy</span>
                    <Badge tone={schedule ? "tertiary" : "neutral"}>
                      {schedule ? "Private until publish" : "Unlisted"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-on-surface-variant">Category</span>
                    <span className="font-mono text-[10px] text-on-surface">Music</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
                  <Icon name="tune" className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                    Upload
                  </p>
                  <h2 className="text-base font-semibold">Upload settings</h2>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <Field label="Chunk size" htmlFor="video-chunk">
                  <Select
                    id="video-chunk"
                    value={chunkSize}
                    onChange={(event) => setChunkSize(Number(event.target.value))}
                  >
                    <option value={DEFAULT_CHUNK_SIZE}>8 MiB — normal upload</option>
                    <option value={CHUNK_ALIGNMENT}>256 KiB — CORS / 308 test</option>
                  </Select>
                </Field>
                <p className="text-xs leading-5 text-on-surface-variant">
                  A non-final 308 needs a file larger than the selected chunk. Use 256 KiB to
                  exercise the CORS path with a larger MP4.
                </p>
                {oneRequest ? (
                  <p className="rounded-lg border border-tertiary/20 bg-tertiary-container/10 px-2.5 py-2 text-xs leading-5 text-tertiary">
                    This file fits in one request, so it will not expose a non-final 308.
                  </p>
                ) : null}
              </div>
            </Card>
          </fieldset>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => abortRef.current?.abort()}
                >
                  <Icon name="close" className="h-4 w-4" />
                  Cancel upload
                </Button>
              ) : (
                <Button type="submit" size="lg" className="flex-1 sm:flex-none">
                  <Icon name="upload" className="h-4 w-4" />
                  Start upload
                </Button>
              )}
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-outline">
                <StatusDot tone={busy ? "tertiary" : "muted"} />
                {busy ? "Upload in progress" : "Ready when you are"}
              </span>
            </div>
            <p className="text-xs leading-5 text-on-surface-variant">
              The file goes directly from this browser to Google. Nothing is uploaded until you
              press Start upload.
            </p>
          </div>

          <Card className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tertiary-container/15 text-tertiary">
                <Icon name="info" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">Before you upload</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-5 text-on-surface-variant">
                  <li className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-outline" />
                    Keep this tab open until YouTube confirms the upload.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-outline" />
                    A scheduled upload stays private until the publish time.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-outline" />
                    The M0 sample is a 5-second 1080p MP4 made by{" "}
                    <code className="font-mono text-on-surface">npm run m0:probe</code>.
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
