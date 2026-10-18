/**
 * Bounded analysis worker (design section 12.6). It receives at most one
 * second of stereo audio per message, keeps per-channel filter state across
 * chunks, and posts the finished feature table. No React, DOM, auth, network or
 * full-track copy lives here.
 */
import { FeatureAnalyzer } from "./audio-features";

export type AnalyzeRequest =
  | { type: "init"; jobId: string }
  | { type: "chunk"; jobId: string; left: ArrayBuffer; right: ArrayBuffer }
  | { type: "finish"; jobId: string; duration: number }
  | { type: "cancel"; jobId: string };

export type AnalyzeResponse =
  | { type: "ready"; jobId: string }
  | { type: "progress"; jobId: string; processed: number }
  | {
      type: "done";
      jobId: string;
      table: {
        version: 1;
        sampleRate: number;
        hopSamples: number;
        hopRate: number;
        duration: number;
        rms: Float32Array;
        low: Float32Array;
        mid: Float32Array;
        high: Float32Array;
      };
    }
  | { type: "error"; jobId: string; message: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalyzeRequest>) => void) | null;
  postMessage: (message: AnalyzeResponse) => void;
};

const jobs = new Map<string, { analyzer: FeatureAnalyzer; reported: number }>();
const PROGRESS_HOPS = 60;

scope.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      jobs.set(message.jobId, { analyzer: new FeatureAnalyzer(), reported: 0 });
      scope.postMessage({ type: "ready", jobId: message.jobId });
      return;
    }

    const job = jobs.get(message.jobId);
    if (!job) return;

    if (message.type === "cancel") {
      jobs.delete(message.jobId);
      return;
    }

    if (message.type === "chunk") {
      job.analyzer.push(new Float32Array(message.left), new Float32Array(message.right));
      const processed = job.analyzer.processed;
      if (processed - job.reported >= PROGRESS_HOPS * 800) {
        job.reported = processed;
        scope.postMessage({ type: "progress", jobId: message.jobId, processed });
      }
      return;
    }

    if (message.type === "finish") {
      const table = job.analyzer.finish(message.duration);
      jobs.delete(message.jobId);
      scope.postMessage({ type: "done", jobId: message.jobId, table });
    }
  } catch (error) {
    jobs.delete(message.jobId);
    scope.postMessage({
      type: "error",
      jobId: message.jobId,
      message: error instanceof Error ? error.message : "Audio analysis failed.",
    });
  }
};
