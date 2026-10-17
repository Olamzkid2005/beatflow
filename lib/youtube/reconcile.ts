/**
 * Matches an upload attempt to the video the channel actually received.
 *
 * The browser cannot read the resumable session's response, so the desk can be
 * left with an unknown outcome even though YouTube stored the video. The server
 * can still see the channel, so it looks for the newest upload with the same
 * title inside a short window around the attempt. Pure and framework-free, so
 * the matching rules are unit tested in Node.
 */

export type ChannelUpload = {
  videoId: string;
  title: string;
  publishedAt: string;
};

export type MatchInput = {
  /** Title sent with the upload; compared after whitespace and case folding. */
  title: string;
  /** When the attempt started, ISO 8601. */
  notBefore: string;
  /** Slack for clock differences between this machine and the API. */
  toleranceMs?: number;
};

/** Two minutes covers clock skew and the moment between navigation and upload. */
export const MATCH_TOLERANCE_MS = 120_000;

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

type PlaylistItemsPayload = {
  items?: Array<{
    snippet?: {
      title?: string;
      publishedAt?: string;
      resourceId?: { videoId?: string };
    };
  }>;
};

/** Reads `playlistItems.list` output defensively; malformed rows are dropped. */
export function parseChannelUploads(payload: unknown): ChannelUpload[] {
  const items = (payload as PlaylistItemsPayload | null)?.items;
  if (!Array.isArray(items)) return [];
  const uploads: ChannelUpload[] = [];
  for (const item of items) {
    const videoId = item?.snippet?.resourceId?.videoId;
    const title = item?.snippet?.title;
    const publishedAt = item?.snippet?.publishedAt;
    if (
      typeof videoId === "string" &&
      videoId.length > 0 &&
      typeof title === "string" &&
      typeof publishedAt === "string" &&
      Number.isFinite(Date.parse(publishedAt))
    ) {
      uploads.push({ videoId, title, publishedAt });
    }
  }
  return uploads;
}

/**
 * Newest upload with the same title at or after `notBefore` (minus slack), or
 * null when nothing matches. Never guesses: a wrong ID would poison history.
 */
export function pickMatchingUpload(items: ChannelUpload[], input: MatchInput): ChannelUpload | null {
  const wanted = normalizeTitle(input.title);
  const notBefore = Date.parse(input.notBefore);
  if (!wanted || !Number.isFinite(notBefore)) return null;
  const tolerance = input.toleranceMs ?? MATCH_TOLERANCE_MS;

  return (
    items
      .filter((item) => normalizeTitle(item.title) === wanted)
      .filter((item) => {
        const published = Date.parse(item.publishedAt);
        return Number.isFinite(published) && published >= notBefore - tolerance;
      })
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null
  );
}
