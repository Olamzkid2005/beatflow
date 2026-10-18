/**
 * Client for the bounded analysis worker (design section 12.6). The decoded
 * AudioBuffer is never detached: each message carries at most one second of
 * copied channel data. If a Worker cannot be constructed or loaded, the same
 * pure analyzer runs in short main-thread slices and reports that mode, rather
 * than silently pretending the background path ran.
 */
import {
  FeatureAnalyzer,
  type AudioFeatureTable,
  type FeatureSample,
} from "./audio-features";
import type { AnalyzeRequest, AnalyzeResponse } from "./audio-analysis.worker";

/** One second of 48 kHz stereo: about 375 KiB per message. */
export const ANALYSIS_CHUNK_SAMPLES = 48_000;
const READY_TIMEOUT_MS = 5_000;

export type AnalysisMode = "worker" | "main-thread";

export type AnalysisResult = {
  table: AudioFeatureTable;
  mode: AnalysisMode;
};

export type AnalysisOptions = {
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
};

function abortError(): Error {
  return new DOMException("Audio analysis was cancelled.", "AbortError");
}

function jobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Analyzes the whole decoded track once. Resolves with the versioned table and
 * the path that produced it; rejects with `AbortError` when cancelled.
 */
export async function analyzeAudio(
  buffer: AudioBuffer,
  { signal, onProgress }: AnalysisOptions = {},
): Promise<AnalysisResult> {
  if (signal?.aborted) throw abortError();
  if (!buffer.length || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
    throw new Error("The decoded audio is empty and cannot be analyzed.");
  }

  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;

  if (typeof Worker !== "undefined") {
    try {
      const table = await analyzeInWorker(left, right, buffer.duration, { signal, onProgress });
      return { table, mode: "worker" };
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw error;
      }
      // Only a worker that never became ready falls back; a failure in the
      // numeric core is a real analysis error and is reported as one.
      if (!(error instanceof Error && error.name === "WorkerUnavailableError")) throw error;
    }
  }

  const table = await analyzeOnMainThread(left, right, buffer.duration, { signal, onProgress });
  return { table, mode: "main-thread" };
}

async function analyzeInWorker(
  left: Float32Array,
  right: Float32Array,
  duration: number,
  { signal, onProgress }: AnalysisOptions,
): Promise<AudioFeatureTable> {
  const id = jobId();
  let worker: Worker;
  try {
    worker = new Worker(new URL("./audio-analysis.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    throw workerUnavailable(error);
  }

  return new Promise<AudioFeatureTable>((resolve, reject) => {
    let ready = false;
    let settled = false;
    let processed = 0;

    const cleanup = () => {
      settled = true;
      clearTimeout(readyTimer);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      cleanup();
      reject(error);
    };
    const finish = (table: AudioFeatureTable) => {
      if (settled) return;
      cleanup();
      resolve(table);
    };
    const onAbort = () => {
      try {
        worker.postMessage({ type: "cancel", jobId: id } satisfies AnalyzeRequest);
      } catch {
        // The worker may already be gone; terminating is enough.
      }
      fail(abortError());
    };

    const readyTimer = setTimeout(() => {
      fail(workerUnavailable(new Error("The analysis worker did not become ready in time.")));
    }, READY_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<AnalyzeResponse>) => {
      const message = event.data;
      if (message.jobId !== id) return;
      if (message.type === "ready") {
        ready = true;
        clearTimeout(readyTimer);
        return;
      }
      if (message.type === "progress") {
        processed = message.processed;
        onProgress?.(Math.min(1, processed / left.length));
        return;
      }
      if (message.type === "error") {
        fail(new Error(message.message));
        return;
      }
      if (message.type === "done") {
        finish(message.table);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(
        ready
          ? new Error(`The analysis worker failed: ${event.message || "unknown error"}`)
          : workerUnavailable(new Error(event.message || "The analysis worker could not load.")),
      );
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    worker.postMessage({ type: "init", jobId: id } satisfies AnalyzeRequest);

    void (async () => {
      // The first chunk waits for the ready handshake, so a bundling failure
      // never consumes the track or rejects with a misleading analysis error.
      for (let attempt = 0; attempt < 500 && !ready && !settled; attempt += 1) {
        await new Promise((done) => setTimeout(done, 10));
      }
      if (settled) return;
      if (!ready) {
        fail(workerUnavailable(new Error("The analysis worker never acknowledged the job.")));
        return;
      }
      try {
        for (let offset = 0; offset < left.length; offset += ANALYSIS_CHUNK_SAMPLES) {
          if (signal?.aborted) throw abortError();
          const end = Math.min(offset + ANALYSIS_CHUNK_SAMPLES, left.length);
          const leftChunk = left.slice(offset, end);
          const rightChunk = right.slice(offset, end);
          worker.postMessage(
            {
              type: "chunk",
              jobId: id,
              left: leftChunk.buffer,
              right: rightChunk.buffer,
            } satisfies AnalyzeRequest,
            [leftChunk.buffer, rightChunk.buffer],
          );
          onProgress?.(Math.min(1, end / left.length));
          // Let messages from the worker and the abort listener run between
          // chunks instead of monopolising the task queue.
          await new Promise((done) => setTimeout(done, 0));
        }
        worker.postMessage({ type: "finish", jobId: id, duration } satisfies AnalyzeRequest);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
}

/**
 * Bounded main-thread fallback. It uses the same numeric core and the same
 * chunk order, so the resulting table is identical to the worker's; only the
 * execution context differs.
 */
async function analyzeOnMainThread(
  left: Float32Array,
  right: Float32Array,
  duration: number,
  { signal, onProgress }: AnalysisOptions,
): Promise<AudioFeatureTable> {
  const analyzer = new FeatureAnalyzer();
  for (let offset = 0; offset < left.length; offset += ANALYSIS_CHUNK_SAMPLES) {
    if (signal?.aborted) throw abortError();
    const end = Math.min(offset + ANALYSIS_CHUNK_SAMPLES, left.length);
    analyzer.push(left.subarray(offset, end), right.subarray(offset, end));
    onProgress?.(Math.min(1, end / left.length));
    await new Promise((done) => setTimeout(done, 0));
  }
  if (signal?.aborted) throw abortError();
  return analyzer.finish(duration);
}

function workerUnavailable(cause: unknown): Error {
  const error = new Error(
    `The analysis worker is unavailable; analysis will run on the main thread. ${
      cause instanceof Error ? cause.message : ""
    }`.trim(),
  );
  error.name = "WorkerUnavailableError";
  return error;
}

export type { AudioFeatureTable, FeatureSample };
