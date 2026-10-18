"use client";

import { useEffect, useRef, useState } from "react";

import { addHistoryEntry } from "@/lib/history";
import { useBeforeUnloadWarning } from "@/lib/use-before-unload";
import { useNavigationGuard } from "@/lib/use-navigation-guard";
import {
  UploadOutcomeUnknownError,
  uploadToResumableSession,
  type UploadProgress,
} from "@/lib/youtube/uploader";

export type UploadResult = {
  videoId: string;
  publishAt: string | null;
  privacyStatus: string;
  /** True when the ID came from the channel lookup, not the upload response. */
  recovered?: boolean;
};

export type RecoveryCandidate = {
  videoId: string;
  title: string;
  publishedAt: string;
};

type UploadAttempt = {
  title: string;
  publishAt: string | null;
  privacyStatus: string;
  channelTitle: string | null;
  startedAt: string;
  /** Set when the response became unreadable; bounds the candidate search. */
  failedAt?: string;
};

export type StartUploadInput = {
  file: File | null;
  title: string;
  description: string;
  tags: string[];
  /** Already validated as future-or-null by the caller. */
  publishAt: string | null;
  privacyStatus: string;
  chunkSize: number;
  channelTitle: string | null;
};

/**
 * Owns the upload lifecycle: session handshake, chunked transfer, cancellation,
 * unknown-outcome recovery, and the local history receipt. Keeping it out of the
 * page keeps the page a rendering concern (generate/page.tsx finding).
 */
export function useUploadJob() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [candidates, setCandidates] = useState<RecoveryCandidate[] | null>(null);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const attemptRef = useRef<UploadAttempt | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // The tab must stay open until YouTube has the file (spec section 7).
  useBeforeUnloadWarning(busy);
  useNavigationGuard(
    busy,
    "An upload is still in progress. Leaving this page can lose the transfer progress. Leave anyway?",
  );

  /** Records the receipt locally; a storage failure must not hide the upload. */
  function saveHistory(entry: Parameters<typeof addHistoryEntry>[0]) {
    void addHistoryEntry(entry).then((saved) => {
      if (!saved) {
        setHistoryWarning(
          "The video reached YouTube, but this browser could not save it to local history. Copy the video ID before leaving.",
        );
      }
    });
  }

  async function startUpload(input: StartUploadInput): Promise<void> {
    if (abortRef.current) return;

    setError(null);
    setOutcomeUnknown(false);
    setResult(null);
    setCandidates(null);
    setHistoryWarning(null);
    setProgress(null);

    const { file, title, publishAt, privacyStatus } = input;
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

    const controller = new AbortController();
    abortRef.current = controller;
    // Records what the outcome lookup needs if the upload response is unreadable.
    attemptRef.current = {
      title: title.trim(),
      publishAt,
      privacyStatus,
      channelTitle: input.channelTitle,
      startedAt: new Date().toISOString(),
    };
    setBusy(true);

    try {
      const initResponse = await fetch("/api/youtube/init-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        body: JSON.stringify({
          metadata: {
            title,
            description: input.description,
            tags: input.tags,
            privacyStatus,
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
        chunkSize: input.chunkSize,
        signal: controller.signal,
        onProgress: setProgress,
      });

      controller.signal.throwIfAborted();

      const completed: UploadResult = {
        videoId,
        publishAt,
        privacyStatus,
      };
      setResult(completed);

      saveHistory({
        videoId,
        title: title.trim(),
        channelTitle: input.channelTitle,
        publishAt,
        privacyStatus: completed.privacyStatus,
        createdAt: new Date().toISOString(),
      });
    } catch (uploadError) {
      if (controller.signal.aborted) {
        setProgress(null);
        setError(
          "Upload cancelled. If YouTube already accepted it, cancellation does not remove the video; check YouTube Studio before uploading again.",
        );
      } else {
        const unknown = uploadError instanceof UploadOutcomeUnknownError;
        setOutcomeUnknown(unknown);
        if (unknown && attemptRef.current) {
          attemptRef.current = {
            ...attemptRef.current,
            failedAt: new Date().toISOString(),
          };
        }
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  /**
   * The desk cannot read the resumable session's response, so an unknown upload
   * outcome stays recoverable. The server returns every same-title upload inside
   * the attempt window; none is adopted until the owner confirms one below.
   */
  async function recoverUpload(): Promise<void> {
    const attempt = attemptRef.current;
    if (!attempt || recovering) return;

    setRecovering(true);
    setError(null);
    setCandidates(null);
    try {
      const response = await fetch("/api/youtube/latest-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          title: attempt.title,
          notBefore: attempt.startedAt,
          notAfter: attempt.failedAt ?? new Date().toISOString(),
        }),
      });
      const body = await response.json().catch(() => null);
      const rows: unknown[] = Array.isArray(body?.candidates) ? body.candidates : [];
      const found = rows.filter((row): row is RecoveryCandidate => {
        if (!row || typeof row !== "object") return false;
        const candidate = row as Record<string, unknown>;
        return (
          typeof candidate.videoId === "string" &&
          candidate.videoId.length > 0 &&
          typeof candidate.publishedAt === "string" &&
          Number.isFinite(Date.parse(candidate.publishedAt))
        );
      });
      if (!response.ok || found.length === 0) {
        setError(body?.error ?? `No matching upload found (${response.status}).`);
        return;
      }

      // Keep the outcome marked unknown until the owner picks one.
      setCandidates(found);
    } catch (recoverError) {
      setError(
        recoverError instanceof Error ? recoverError.message : "Could not look up the upload.",
      );
    } finally {
      setRecovering(false);
    }
  }

  /**
   * A confirmed ID names the video, but its actual privacy, processing state and
   * schedule were never readable. Record them as unknown rather than copying the
   * request's intent into the history.
   */
  function confirmRecovered(candidate: RecoveryCandidate): void {
    const attempt = attemptRef.current;
    if (!attempt) return;

    setCandidates(null);
    setOutcomeUnknown(false);
    setError(null);
    setResult({
      videoId: candidate.videoId,
      publishAt: null,
      privacyStatus: "unknown",
      recovered: true,
    });
    saveHistory({
      videoId: candidate.videoId,
      title: attempt.title,
      channelTitle: attempt.channelTitle,
      publishAt: null,
      privacyStatus: "unknown",
      createdAt: new Date().toISOString(),
    });
  }

  /** Cancellation is local; it cannot remove a video YouTube already accepted. */
  function cancelUpload(): void {
    abortRef.current?.abort();
  }

  return {
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
  };
}
