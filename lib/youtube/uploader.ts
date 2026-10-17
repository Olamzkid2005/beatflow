/** Browser-only resumable upload: the MP4 goes directly to Google, never through Next. */
export const CHUNK_ALIGNMENT = 256 * 1024;
export const DEFAULT_CHUNK_SIZE = CHUNK_ALIGNMENT * 32;
const MAX_RETRIES = 5;
const REQUEST_TIMEOUT_MS = 60_000;

export type UploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
};

export type UploadOptions = {
  sessionUri: string;
  file: Blob;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

export class UploadError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "UploadError";
    this.status = status;
    this.retryable = retryable;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function retryDelay(attempt: number, response?: Response): number {
  const header = response?.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(delay)) return Math.max(0, delay);
  }
  return Math.min(2 ** attempt * 500, 8_000);
}

/**
 * Recover within the same session after network/5xx failures. Only a confirmed
 * response advances progress; a completed status query returns the original ID.
 */
export async function uploadToResumableSession({
  sessionUri,
  file,
  chunkSize = DEFAULT_CHUNK_SIZE,
  signal,
  onProgress,
}: UploadOptions): Promise<string> {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < CHUNK_ALIGNMENT || chunkSize % CHUNK_ALIGNMENT !== 0) {
    throw new Error(`Chunk size must be a positive multiple of ${CHUNK_ALIGNMENT} bytes.`);
  }
  if (file.size === 0) throw new UploadError("Cannot upload an empty file.", 0, false);

  const totalBytes = file.size;
  let offset = 0;
  let highestOffset = 0;
  let attempts = 0;
  let queryStatus = false;
  const report = () => onProgress?.({
    uploadedBytes: offset,
    totalBytes,
    percent: Math.round(offset / totalBytes * 100),
  });
  const retry = async (message: string, status: number, response?: Response) => {
    attempts += 1;
    if (attempts > MAX_RETRIES) {
      throw new UploadError(`${message} Retry limit reached; do not create another upload without checking YouTube Studio.`, status, true);
    }
    await sleep(retryDelay(attempts, response), signal);
  };

  signal?.throwIfAborted();
  report();
  for (;;) {
    signal?.throwIfAborted();
    const wasQuery = queryStatus;
    const end = Math.min(offset + chunkSize, totalBytes);
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(sessionUri, {
        method: "PUT",
        headers: wasQuery
          ? { "Content-Range": `bytes */${totalBytes}` }
          : {
              "Content-Range": `bytes ${offset}-${end - 1}/${totalBytes}`,
              "Content-Type": file.type || "video/mp4",
            },
        body: wasQuery ? undefined : file.slice(offset, end),
        signal: requestSignal,
      });
    } catch {
      signal?.throwIfAborted();
      await retry("Could not reach the YouTube upload session.", 0);
      queryStatus = true;
      continue;
    }
    signal?.throwIfAborted();

    if (response.status === 200 || response.status === 201) {
      const body: unknown = await response.json().catch(() => null);
      signal?.throwIfAborted();
      if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !body.id) {
        throw new UploadError("YouTube accepted the upload but returned no video id. Check YouTube Studio before uploading again.", response.status, false);
      }
      offset = totalBytes;
      report();
      return body.id;
    }

    if (response.status === 308) {
      const range = response.headers.get("Range");
      const match = range?.match(/^bytes=0-(\d+)$/);
      if (range && !match) throw new UploadError("YouTube returned an invalid upload Range.", 308, false);
      // Per Google's protocol, absent Range means no stored bytes. Never guess
      // that the sent chunk landed; CORS-hidden headers must not advance offset.
      const confirmed = match ? Number(match[1]) + 1 : 0;
      if (!Number.isSafeInteger(confirmed) || confirmed > totalBytes || confirmed < offset) {
        throw new UploadError("YouTube's confirmed upload offset is inconsistent. Check CORS access to the Range header.", 308, false);
      }
      offset = confirmed;
      report();
      if (confirmed > highestOffset) {
        highestOffset = confirmed;
        attempts = 0;
      } else if (!wasQuery) {
        await retry("YouTube is not confirming upload progress. Check CORS access to the Range header.", 308, response);
      }
      // A query after a failed PUT establishes the offset, but is not itself a
      // successful data transfer. Keep retry attempts until bytes advance.
      queryStatus = confirmed === totalBytes;
      if (wasQuery && confirmed === totalBytes) {
        await retry("YouTube has not returned the completed video resource.", 308, response);
      }
      continue;
    }

    if (response.status === 429 || [500, 502, 503, 504].includes(response.status)) {
      await retry(`YouTube upload failed (${response.status}).`, response.status, response);
      queryStatus = true;
      continue;
    }

    const detail = await response.text().catch(() => "");
    signal?.throwIfAborted();
    const message = response.status === 401 || response.status === 403
      ? "YouTube rejected the upload. Sign in again and check YouTube Studio before retrying."
      : `YouTube upload failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`;
    throw new UploadError(message, response.status, false);
  }
}
