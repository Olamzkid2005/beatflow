"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { RenderStudio } from "@/components/render-studio";
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
import {
  adoptArtifact,
  chooseFile,
  releaseArtifact,
  type UploadSelection,
} from "@/lib/artifact-ownership";
import { fillDescriptionTokens } from "@/lib/release-templates";
import { readSettings } from "@/lib/settings";
import { browserTimeZone, nextScheduleValue, toUtcIso8601 } from "@/lib/time";
import { useChannel } from "@/lib/use-channel";
import { useUploadJob } from "@/lib/use-upload-job";
import { CHUNK_ALIGNMENT, DEFAULT_CHUNK_SIZE } from "@/lib/youtube/uploader";

const subscribe = () => () => {};

/** Filename-derived title, used only while the owner has not edited the field. */
function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultSchedule(timeZone: string): string {
  return nextScheduleValue(new Date(Date.now()), timeZone);
}

/** UTC instant the current wall time resolves to, or null while it is invalid. */
function utcConfirmation(localValue: string, timeZone: string): string | null {
  if (!localValue) return null;
  try {
    const iso = toUtcIso8601(localValue, timeZone);
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  } catch {
    return null;
  }
}

/** Kept out of the component so the React compiler sees no clock read in render analysis. */
function assertFutureSchedule(publishAt: string | null): void {
  if (publishAt && Date.parse(publishAt) <= Date.now()) {
    throw new Error("Choose a schedule in the future.");
  }
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
  const [defaults, setDefaults] = useState(readSettings);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(() =>
    fillDescriptionTokens(defaults.descriptionTemplate, {
      producer_name: defaults.producerName,
    }),
  );
  const [tags, setTags] = useState<string[]>(() => [...defaults.defaultTags]);
  // Resolve the working zone before the default: the input holds wall time in
  // that zone, not in the browser's zone.
  const [timeZone] = useState(() => {
    if (!defaults.timezone) return browserTimeZone();
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: defaults.timezone }).format();
      return defaults.timezone;
    } catch {
      return browserTimeZone();
    }
  });
  const [schedule, setSchedule] = useState(() => defaultSchedule(timeZone));
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [selection, setSelection] = useState<UploadSelection | null>(null);
  const file = selection?.file ?? null;
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE);
  const [dragging, setDragging] = useState(false);
  const [immediatePrivacy, setImmediatePrivacy] = useState<"unlisted" | "public">(() => defaults.defaultVisibility);

  const {
    busy,
    progress,
    error,
    outcomeUnknown,
    result,
    recovering,
    candidates,
    historyWarning,
    startUpload,
    recoverUpload,
    confirmRecovered,
    cancelUpload,
  } = useUploadJob();
  const titleTouchedRef = useRef(false);
  const metadataTouchedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings can be saved while this page stays mounted (the first-run dialog
  // overlays it). Refresh untouched defaults so the tour and the form agree.
  useEffect(() => {
    const sync = () => {
      const next = readSettings();
      setDefaults(next);
      if (metadataTouchedRef.current) return;
      setDescription(
        fillDescriptionTokens(next.descriptionTemplate, { producer_name: next.producerName }),
      );
      setTags([...next.defaultTags]);
      setImmediatePrivacy(next.defaultVisibility);
    };
    window.addEventListener("beatflow:settings", sync);
    return () => window.removeEventListener("beatflow:settings", sync);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let publishAt: string | null = null;
    try {
      publishAt = schedule ? toUtcIso8601(schedule, timeZone) : null;
      assertFutureSchedule(publishAt);
    } catch (scheduleFailure) {
      setScheduleError(
        scheduleFailure instanceof Error ? scheduleFailure.message : "Invalid schedule.",
      );
      return;
    }
    setScheduleError(null);
    // Scheduling always publishes private until the chosen instant; an
    // immediate upload keeps the owner's explicit visibility choice.
    await startUpload({
      file,
      title,
      description,
      tags,
      publishAt,
      privacyStatus: publishAt ? "private" : immediatePrivacy,
      chunkSize,
      channelTitle: channel?.title ?? null,
    });
  }

  // A manually chosen MP4 resets the title and, while the producer has not
  // edited them, re-fills the description template for that release.
  function selectManualFile(selected: File | null) {
    setSelection(chooseFile(selected));
    titleTouchedRef.current = false;
    const nextTitle = selected ? titleFromFileName(selected.name) : "";
    setTitle(nextTitle);
    if (!metadataTouchedRef.current) {
      setDescription(
        fillDescriptionTokens(defaults.descriptionTemplate, {
          track_name: nextTitle,
          producer_name: defaults.producerName,
        }),
      );
    }
  }

  const descriptionBytes = new TextEncoder().encode(description).length;
  const scheduleUtc = utcConfirmation(schedule, timeZone);
  const oneRequest = Boolean(file && file.size <= chunkSize);
  const channelTone = channelError ? "danger" : channel ? "success" : "neutral";

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Studio
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            1. Render your beat video · 2. Choose the MP4 · 3. Set details, schedule, and upload
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={channelTone} className="max-w-full">
            <StatusDot tone={channelError ? "danger" : channel ? "success" : "muted"} />
            <span className="min-w-0 max-w-[16rem] truncate">
              {channelLoading
                ? "Checking channel"
                : channelError
                  ? "Channel offline"
                  : channel
                    ? `${channel.title ?? "Channel"} · ${formatCount(channel.subscriberCount)} subs`
                    : "No channel"}
            </span>
          </Badge>
          {channelError ? (
            <Link href="/" className={buttonClass({ variant: "outline", size: "sm" })}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Reconnect
            </Link>
          ) : null}
          <Link href="/batch" className={buttonClass({ variant: "outline", size: "sm" })}>
            <Icon name="studio" className="h-3.5 w-3.5" />
            Batch mode
          </Link>
        </div>
      </header>

      <RenderStudio
        producerName={defaults.producerName}
        uploading={busy}
        onSourceChange={(trackTitle) => {
          titleTouchedRef.current = false;
          setTitle(trackTitle);
          if (!metadataTouchedRef.current) {
            setDescription(
              fillDescriptionTokens(defaults.descriptionTemplate, {
                track_name: trackTitle,
                producer_name: defaults.producerName,
              }),
            );
          }
        }}
        onRenderedFile={(rendered, artifactId, trackTitle, details) => {
          setSelection(adoptArtifact(rendered, artifactId));
          if (!titleTouchedRef.current) setTitle(trackTitle);
          // Templates keep the release title, producer, key and BPM in sync until
          // the producer edits the description themselves.
          if (!metadataTouchedRef.current) {
            setDescription(
              fillDescriptionTokens(defaults.descriptionTemplate, {
                track_name: trackTitle,
                producer_name: defaults.producerName,
                bpm: details.bpm,
                key: details.key,
              }),
            );
          }
        }}
        onReleaseArtifact={(artifactId) =>
          setSelection((current) => releaseArtifact(current, artifactId))
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-3 sm:px-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  Step 2 · Video file
                </p>
                <h2 className="text-base font-semibold">MP4 to upload</h2>
              </div>
              <Badge tone={file ? "primary" : "neutral"}>
                <StatusDot tone={file ? "primary" : "muted"} />
                {file ? "MP4 ready" : "Waiting for MP4"}
              </Badge>
            </div>

            <div className="relative">
              <input
                ref={fileInputRef}
                id="video-file"
                type="file"
                accept="video/mp4"
                disabled={busy}
                onChange={(event) => {
                  selectManualFile(event.target.files?.[0] ?? null);
                }}
                className="peer sr-only"
              />
              <label
                data-tour="video-file"
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
                  if (dropped) selectManualFile(dropped);
                }}
                className={cn(
                  "group relative flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden border-b border-surface-container-highest bg-surface-container-lowest p-6 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
                  dragging && "bg-primary/5",
                  busy && "cursor-not-allowed opacity-70",
                )}
              >
                <div className="relative flex flex-col items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary transition group-hover:scale-105">
                    <Icon name={file ? "movie" : "upload"} className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="max-w-full break-all text-base font-medium">
                      {file ? file.name : "Drop an MP4 here or click to choose"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                      {file
                        ? `${formatBytes(file.size)} · ${file.type || "video/mp4"} · ready to upload`
                        : "Or click “Use for upload” on your rendered video above."}
                    </p>
                  </div>
                </div>
              </label>
            </div>

            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {file ? file.name : "No video selected"}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-outline">
                  {file
                    ? `${formatBytes(file.size)} · ${file.type || "video/mp4"}`
                    : "MP4 · rendered or exported file"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  <Icon name="folder" className="h-3.5 w-3.5" />
                  {file ? "Replace MP4" : "Choose MP4"}
                </button>
                <a
                  href="/beatflow-m0-test-5s.mp4"
                  download="beatflow-m0-test-5s.mp4"
                  className={buttonClass({ variant: "ghost", size: "sm" })}
                >
                  <Icon name="download" className="h-3.5 w-3.5" />
                  Sample MP4
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
                    {busy
                      ? "Sending to YouTube"
                      : result
                        ? "Upload complete"
                        : outcomeUnknown
                          ? "Outcome unknown"
                          : error
                            ? "Upload stopped"
                            : "Upload ended"}
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
                <span>{busy ? "Keep this tab open" : result ? "Handed off" : "Not handed off"}</span>
              </div>
              {!busy && !result ? (
                <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                  Only a confirmed video result counts as complete. This transfer did not produce
                  one{progress ? ` after ${progress.percent}%` : ""}.
                </p>
              ) : null}
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
                  <p className="text-sm font-medium text-error">
                    {outcomeUnknown ? "Upload outcome unknown" : "Upload issue"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-on-surface-variant">{error}</p>
                  {outcomeUnknown ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={recovering || busy}
                        onClick={recoverUpload}
                      >
                        <Icon name="search" className="h-3.5 w-3.5" />
                        {recovering ? "Looking on your channel…" : "Find it on my channel"}
                      </Button>
                      <a
                        href="https://studio.youtube.com/"
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        Check YouTube Studio
                        <Icon name="external" className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {outcomeUnknown && candidates ? (
            <Card role="group" aria-label="Recovery candidates" className="p-4 sm:p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                Recovery
              </p>
              <h2 className="mt-1 text-base font-semibold">
                Choose the upload this attempt created
              </h2>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                These uploads share this title and fall inside the attempt window. Nothing is
                recorded until you confirm one.
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {candidates.map((candidate) => (
                  <li
                    key={candidate.videoId}
                    className="flex flex-col gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-lowest/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{candidate.title}</p>
                      <p className="mt-1 font-mono text-[10px] text-outline">
                        {candidate.videoId} · {formatSchedule(candidate.publishedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://studio.youtube.com/video/${candidate.videoId}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        Check in Studio
                        <Icon name="external" className="h-3.5 w-3.5" />
                      </a>
                      <Button type="button" size="sm" onClick={() => confirmRecovered(candidate)}>
                        <Icon name="check" className="h-3.5 w-3.5" />
                        That&apos;s this upload
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
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
                    <p className="text-sm font-medium text-emerald-200">
                      {result.recovered ? "Confirmed on your channel" : "Uploaded to YouTube"}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
                      {result.videoId}
                    </p>
                    {result.recovered ? (
                      <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                        You confirmed this video ID after an unreadable upload response. Its
                        privacy, processing state and schedule could not be verified here — check
                        YouTube Studio before relying on them.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                        {result.publishAt
                          ? `Scheduled for ${formatSchedule(result.publishAt)} · ${result.privacyStatus} until then`
                          : `Uploaded as ${result.privacyStatus}`}
                      </p>
                    )}
                    {historyWarning ? (
                      <p
                        role="status"
                        className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-2 text-xs leading-5 text-amber-200"
                      >
                        {historyWarning}
                      </p>
                    ) : null}
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

        <form id="upload-form" onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-5">
          <fieldset disabled={busy} className="contents">
            <Card data-tour="publishing-schedule" className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                    Step 3 · Publish to YouTube
                  </p>
                  <h2 className="mt-1 text-base font-semibold">Release details &amp; schedule</h2>
                </div>
                <Link href="/settings" className="text-xs text-primary hover:underline">
                  Edit defaults
                </Link>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <Field label="Title" htmlFor="video-title" hint={`${title.length}/100`}>
                  <Input
                    id="video-title"
                    value={title}
                    onChange={(event) => {
                      titleTouchedRef.current = true;
                      setTitle(event.target.value);
                    }}
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
                    data-tour="video-description"
                    id="video-description"
                    value={description}
                    onChange={(event) => {
                      metadataTouchedRef.current = true;
                      setDescription(event.target.value);
                    }}
                    rows={4}
                    placeholder="Tracklist, credits, links…"
                  />
                </Field>

                <Field label="Tags" htmlFor="video-tags" hint="Enter to add">
                  <TagInput
                    data-tour="video-tags"
                    id="video-tags"
                    value={tags}
                    onChange={(next) => {
                      metadataTouchedRef.current = true;
                      setTags(next);
                    }}
                    placeholder="beat, instrumental, type beat…"
                  />
                </Field>

                <div className="border-t border-outline-variant/60 pt-4">
                  <Field
                    label="Publish at"
                    htmlFor="video-schedule"
                    hint={timeZone}
                    error={scheduleError ?? undefined}
                  >
                    <Input
                      id="video-schedule"
                      data-tour="video-schedule"
                      type="datetime-local"
                      value={schedule}
                      onChange={(event) => {
                        setSchedule(event.target.value);
                        setScheduleError(null);
                      }}
                    />
                  </Field>
                  {schedule && scheduleUtc ? (
                    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-outline">
                      Sends as {scheduleUtc} · wall time in {timeZone} · Private until publish
                    </p>
                  ) : schedule ? (
                    <p className="mt-1.5 text-xs leading-5 text-error">
                      This time is not valid in {timeZone}. Choose another time.
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs leading-5 text-on-surface-variant">
                      No schedule · uploads {immediatePrivacy} immediately
                    </p>
                  )}
                  <p className="mt-1.5 text-xs leading-5 text-on-surface-variant">
                    Sent as UTC ISO 8601 and kept private until publication. Clear the field to
                    choose immediate visibility.
                  </p>

                  {!schedule ? (
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Immediate visibility">
                      {(["unlisted", "public"] as const).map((value) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={immediatePrivacy === value ? "secondary" : "ghost"}
                          aria-pressed={immediatePrivacy === value}
                          onClick={() => {
                            metadataTouchedRef.current = true;
                            setImmediatePrivacy(value);
                          }}
                        >
                          {value === "public" ? "Public immediately" : "Unlisted immediately"}
                        </Button>
                      ))}
                    </div>
                  ) : null}
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
                    Advanced
                  </p>
                  <h2 className="text-base font-semibold">Upload settings</h2>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <Field label="Chunk size" htmlFor="video-chunk" hint="8 MiB standard">
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
                  Only change this to exercise the CORS path. A non-final 308 needs a file larger
                  than the selected chunk, so use 256 KiB with a larger MP4.
                </p>
                {oneRequest ? (
                  <p className="rounded-lg border border-tertiary/20 bg-tertiary-container/10 px-2.5 py-2 text-xs leading-5 text-tertiary">
                    This file fits in one request, so it will not expose a non-final 308.
                  </p>
                ) : null}
              </div>
            </Card>
          </fieldset>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={cancelUpload}
                >
                  <Icon name="close" className="h-4 w-4" />
                  Cancel upload
                </Button>
              ) : (
                <Button data-tour="upload-submit" type="submit" size="lg" className="w-full sm:w-auto">
                  <Icon name="upload" className="h-4 w-4" />
                  Start upload
                </Button>
              )}
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-outline">
                <StatusDot tone={busy ? "tertiary" : "muted"} />
                {busy ? "Keep tab open while uploading" : "Uploads directly to YouTube"}
              </span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
