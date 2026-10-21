/**
 * Starting points for release tags. Suggestions are a shortcut for typing, not
 * a vocabulary: every field still accepts free text, and YouTube applies its own
 * limits (500 characters of tags, no angle brackets) when the upload is sent.
 */

export type TagGroup = { label: string; tags: readonly string[] };

export const TAG_GROUPS: readonly TagGroup[] = [
  {
    label: "Genre",
    tags: [
      "afrobeats",
      "amapiano",
      "hip hop",
      "trap",
      "drill",
      "r&b",
      "soul",
      "dancehall",
      "gospel",
      "pop",
      "lo-fi",
      "edm",
    ],
  },
  {
    label: "Release type",
    tags: ["instrumental", "type beat", "beat", "remix", "freestyle", "cover", "acapella"],
  },
  {
    label: "Discovery",
    tags: ["new music", "producer", "unsigned", "underground", "study music"],
  },
];

export const TAG_SUGGESTIONS: readonly string[] = TAG_GROUPS.flatMap((group) => group.tags);

/**
 * Splits comma-separated text into tags, dropping blanks and case-insensitive
 * duplicates. The first spelling of a duplicate wins.
 */
export function parseTagText(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** Appends one tag to comma-separated text, normalising the separators. */
export function addTagToText(text: string, tag: string): string {
  return parseTagText(`${text},${tag}`).join(", ");
}

/** Returns a new array with `tag` appended once, ignoring case. */
export function mergeTag(tags: readonly string[], tag: string): string[] {
  return parseTagText([...tags, tag].join(","));
}

/** True when the tag is already in the list, compared case-insensitively. */
export function hasTag(tags: readonly string[], tag: string): boolean {
  const key = tag.trim().toLowerCase();
  return tags.some((existing) => existing.trim().toLowerCase() === key);
}
