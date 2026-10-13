"use client";

import { useEffect, useRef, useState } from "react";

import { browserTimeZone, toDateTimeLocalValue, toUtcIso8601 } from "@/lib/time";
import { uploadToResumableSession, type UploadProgress } from "@/lib/youtube/uploader";

type Channel = {
  id: string;
  title: string | null;
  avatar: string | null;
  subscriberCount: string | null;
  videoCount: string | null;
};

type UploadResult = {
  videoId: string;
  publishAt: string;
  privacyStatus: string;
};

const TEST_TITLE = "BeatFlow M0 test — 5 seconds";

function defaultSchedule(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 10 * 60 * 1000));
}

export default function GeneratePage() {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

  const [title, setTitle] = useState(TEST_TITLE);
  const [description, setDescription] = useState("M0 pipeline proof for BeatFlow.");
  const [tags, setTags] = useState("");
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timeZone = browserTimeZone();

  useEffect(() => {
    let cancelled = false;

    fetch("/api/youtube/channel")
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setChannelError(body.error ?? `Request failed (${response.status})`);
          return;
        }
        setChannel(body as Channel);
      })
      .catch(() => {
        if (!cancelled) setChannelError("Could not reach the channel endpoint.");
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  async function startUpload(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setProgress(null);

    if (!file) {
      setError("Choose a 5-second MP4 first.");
      return;
    }

    let publishAt: string | null = null;
    try {
      publishAt = schedule ? toUtcIso8601(schedule, timeZone) : null;
    } catch {
      setError("The schedule value is not a valid date and time.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);

    try {
      const initResponse = await fetch("/api/youtube/init-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            title,
            description,
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            // A scheduled upload must be private.
            privacyStatus: publishAt ? "private" : "unlisted",
            publishAt,
          },
          fileSize: file.size,
        }),
      });

      const initBody = await initResponse.json();
      if (!initResponse.ok) {
        throw new Error(initBody.error ?? `Could not start the upload (${initResponse.status})`);
      }

      const videoId = await uploadToResumableSession({
        sessionUri: initBody.sessionUri as string,
        file,
        signal: controller.signal,
        onProgress: setProgress,
      });

      setResult({
        videoId,
        publishAt: publishAt ?? "immediate",
        privacyStatus: publishAt ? "private (scheduled)" : "unlisted",
      });
    } catch (uploadError) {
      if (controller.signal.aborted) {
        setError("Upload cancelled.");
      } else {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">M0 pipeline proof</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Confirms owner-only sign-in, channel access and a scheduled upload through a
          browser-side resumable session.
        </p>
      </header>

      <section className="rounded-xl border border-black/[.08] p-6 dark:border-white/[.145]">
        <h2 className="text-sm font-medium text-zinc-500">Channel</h2>
        {channelError ? (
          <p className="mt-2 text-red-600 dark:text-red-400">{channelError}</p>
        ) : !channel ? (
          <p className="mt-2 text-zinc-500">Loading…</p>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            {channel.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.avatar} alt="" className="h-10 w-10 rounded-full" />
            ) : null}
            <div className="flex flex-col">
              <span className="font-medium">{channel.title ?? channel.id}</span>
              <span className="text-sm text-zinc-500">
                {channel.subscriberCount ?? "?"} subscribers · {channel.videoCount ?? "?"} videos
              </span>
            </div>
          </div>
        )}
      </section>

      <form onSubmit={startUpload} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            className="h-11 rounded-lg border border-black/[.12] px-3 dark:border-white/[.18] dark:bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="rounded-lg border border-black/[.12] p-3 dark:border-white/[.18] dark:bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tags (comma separated)</span>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            className="h-11 rounded-lg border border-black/[.12] px-3 dark:border-white/[.18] dark:bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Schedule ({timeZone})</span>
          <input
            type="datetime-local"
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
            className="h-11 rounded-lg border border-black/[.12] px-3 dark:border-white/[.18] dark:bg-transparent"
          />
          <span className="text-xs text-zinc-500">
            Sent as UTC ISO 8601 with privacyStatus private.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Test MP4</span>
          <input
            type="file"
            accept="video/mp4"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="text-xs text-zinc-500">
            Needs a 5-second MP4. One is bundled:{" "}
            <a
              className="underline"
              href="/beatflow-m0-test-5s.mp4"
              download="beatflow-m0-test-5s.mp4"
            >
              beatflow-m0-test-5s.mp4
            </a>{" "}
            (1080p, 1 fps, from <code className="font-mono">npm run m0:probe</code>).
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-full bg-foreground px-6 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Start scheduled upload"}
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="h-11 rounded-full border border-black/[.12] px-6 font-medium dark:border-white/[.18]"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {progress ? (
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/[.08] dark:bg-white/[.12]">
            <div
              className="h-full rounded-full bg-foreground transition-[width]"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="text-sm text-zinc-500">
            {progress.percent}% · {(progress.uploadedBytes / 1_048_576).toFixed(1)} MB of{" "}
            {(progress.totalBytes / 1_048_576).toFixed(1)} MB
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <h2 className="font-medium text-emerald-700 dark:text-emerald-400">Uploaded</h2>
          <p className="text-sm">
            Video id <code className="font-mono">{result.videoId}</code>
          </p>
          <p className="text-sm">Privacy: {result.privacyStatus}</p>
          <p className="text-sm">Publish at: {result.publishAt}</p>
          <a
            className="text-sm underline"
            href={`https://studio.youtube.com/video/${result.videoId}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            Open in YouTube Studio
          </a>
        </div>
      ) : null}
    </main>
  );
}
