/**
 * Browser-side resumable upload.
 *
 * The server starts the session and returns its URI; the MP4 itself goes
 * straight from the browser to Google so it never passes through a Vercel
 * Function (which rejects bodies over ~4.5 MB).
 *
 * No React imports: this module is plain browser code.
 */

/** YouTube requires chunk sizes to be a multiple of 256 KiB. */
export const CHUNK_ALIGNMENT = 256 * 1024;

/** 8 MiB per chunk: aligned, and few enough requests for a 10-minute MP3. */
export const DEFAULT_CHUNK_SIZE = CHUNK_ALIGNMENT * 32;

export type UploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  /** 0–100, rounded. */
  percent: number;
};

export type UploadOptions = {
  /** The `Location` header from `POST /api/youtube/init-upload`. */
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function alignmentError(chunkSize: number) {
  return new Error(
    `Chunk size ${chunkSize} is invalid: YouTube requires a multiple of ${CHUNK_ALIGNMENT} bytes.`,
  );
}

/**
 * Uploads `file` to an existing resumable session and resolves with the new
 * YouTube video id. Resumes from the server's reported offset after a failure.
 */
export async function uploadToResumableSession({
  sessionUri,
  file,
  chunkSize = DEFAULT_CHUNK_SIZE,
  signal,
  onProgress,
}: UploadOptions): Promise<string> {
  if (chunkSize % CHUNK_ALIGNMENT !== 0) {
    throw alignmentError(chunkSize);
  }
  if (chunkSize < CHUNK_ALIGNMENT) {
    throw alignmentError(chunkSize);
  }

  const totalBytes = file.size;
  let offset = 0;

  const report = () => {
    onProgress?.({
      uploadedBytes: offset,
      totalBytes,
      percent: totalBytes === 0 ? 100 : Math.round((offset / totalBytes) * 100),
    });
  };

  report();

  let attempt = 0;
  while (offset < totalBytes) {
    signal?.throwIfAborted();

    const end = Math.min(offset + chunkSize, totalBytes);
    const chunk = file.slice(offset, end);
    // The final chunk is allowed to be smaller than the alignment.
    const contentRange = `bytes ${offset}-${end - 1}/${totalBytes}`;

    let response: Response;
    try {
      response = await fetch(sessionUri, {
        method: "PUT",
        headers: {
          "Content-Range": contentRange,
          "Content-Type": file.type || "video/mp4",
        },
        body: chunk,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new UploadError("Network error while uploading to YouTube.", 0, true);
    }

    // 308 = resume incomplete: YouTube stored the bytes so far.
    if (response.status === 308) {
      offset = await resolveOffset(sessionUri, totalBytes, offset, end);
      attempt = 0;
      report();
      continue;
    }

    if (response.status === 200 || response.status === 201) {
      offset = totalBytes;
      report();
      const body = (await response.json().catch(() => null)) as { id?: string } | null;
      if (!body?.id) {
        throw new UploadError("YouTube accepted the upload but returned no video id.", response.status, false);
      }
      return body.id;
    }

    if (response.status === 401 || response.status === 403) {
      throw new UploadError(
        "YouTube rejected the upload. The session may have expired or the token lost access.",
        response.status,
        false,
      );
    }

    const retryable = response.status >= 500 || response.status === 429;
    attempt += 1;
    if (!retryable || attempt > 5) {
      const detail = await response.text().catch(() => "");
      throw new UploadError(
        `YouTube upload failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
        response.status,
        retryable,
      );
    }

    // Exponential backoff, then resume from wherever the server stopped.
    await sleep(Math.min(2 ** attempt * 500, 8_000));
    offset = await resolveOffset(sessionUri, totalBytes, offset, offset);
    report();
  }

  throw new UploadError("Upload finished without a video id.", 0, false);
}

/** Asks the session how many bytes it already holds. */
async function resolveOffset(
  sessionUri: string,
  totalBytes: number,
  fallback: number,
  sentUpTo: number,
): Promise<number> {
  try {
    const response = await fetch(sessionUri, {
      method: "PUT",
      headers: { "Content-Range": `bytes */${totalBytes}` },
    });

    if (response.status === 308) {
      const range = response.headers.get("Range");
      const match = range ? /bytes=0-(\d+)/.exec(range) : null;
      if (match) return Number(match[1]) + 1;
    }

    if (response.status === 200 || response.status === 201) {
      return totalBytes;
    }
  } catch {
    // Fall through to the caller's best guess.
  }

  return Math.max(fallback, sentUpTo);
}
