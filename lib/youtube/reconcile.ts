/**
 * Candidate uploads for an attempt whose response could not be read.
 *
 * A title and a timestamp are not an identity: an earlier or later upload can
 * share the title, and a retry can add another. The desk therefore shows every
 * candidate inside the attempt window and records nothing until the owner
 * explicitly confirms one. Pure and framework-free, so the window rules are
 * unit tested in Node.
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
  /** When the attempt stopped waiting for a readable response, ISO 8601. */
  notAfter: string;
  /** Slack for clock differences between this machine and the API. */
  toleranceMs?: number;
};

/** Two minutes covers clock skew and the moment between navigation and upload. */
export const MATCH_TOLERANCE_MS = 120_000;

/** Candidates shown at once; more than this is a sign the title is not unique. */
export const MAX_CANDIDATES = 10;

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
 * Every distinct upload with the same title inside the bounded attempt window,
 * newest first. Returning a list is deliberate: the caller must not treat the
 * newest row as proof that this attempt created it.
 */
export function findMatchingUploads(items: ChannelUpload[], input: MatchInput): ChannelUpload[] {
  const wanted = normalizeTitle(input.title);
  const start = Date.parse(input.notBefore);
  const end = Date.parse(input.notAfter);
  if (!wanted || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const tolerance = input.toleranceMs ?? MATCH_TOLERANCE_MS;
  const seen = new Set<string>();

  return items
    .filter((item) => normalizeTitle(item.title) === wanted)
    .filter((item) => {
      const published = Date.parse(item.publishedAt);
      return (
        Number.isFinite(published) &&
        published >= start - tolerance &&
        published <= end + tolerance
      );
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((item) => (seen.has(item.videoId) ? false : seen.add(item.videoId)))
    .slice(0, MAX_CANDIDATES);
}
