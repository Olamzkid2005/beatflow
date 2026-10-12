/**
 * Thin helpers for talking to the YouTube Data API with a bearer token.
 * Kept free of framework imports so it can be reused by any route handler.
 */

export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";

export class YouTubeApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.details = details;
  }
}

export function authedFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
}

/** Unwraps Google's error envelope into a readable message. */
export async function readGoogleError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
    };
    if (typeof body.error === "string") return body.error;
    if (body.error?.message) return body.error.message;
  } catch {
    // Fall through to the status code.
  }
  return `YouTube API request failed (${response.status})`;
}
