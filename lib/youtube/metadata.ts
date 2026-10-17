import { z } from "zod";

/**
 * Metadata rules from the YouTube Data API. Every field is editable per upload,
 * so validation happens before the resumable session is started.
 */

export const MUSIC_CATEGORY_ID = "10";
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_BYTES = 5_000;
export const MAX_TAGS_CHARACTERS = 500;

/** YouTube rejects `<` and `>` in titles and descriptions. */
const ANGLE_BRACKETS = /[<>]/;

/** Strict UTC ISO 8601, e.g. `2026-10-20T17:00:00Z`. */
const UTC_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

export const videoMetadataSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required.")
      .max(MAX_TITLE_LENGTH, `Title must be at most ${MAX_TITLE_LENGTH} characters.`)
      .refine((value) => !ANGLE_BRACKETS.test(value), "Title cannot contain < or >."),
    description: z.string().refine((value) => !ANGLE_BRACKETS.test(value), "Description cannot contain < or >.").default(""),
    tags: z.array(z.string().trim().min(1, "Tags cannot be empty.")).default([]),
    privacyStatus: z.enum(["public", "unlisted", "private"]),
    /** Required when `privacyStatus` is `private` and you want a schedule. */
    publishAt: z.string().nullish(),
    categoryId: z.string().default(MUSIC_CATEGORY_ID),
    selfDeclaredMadeForKids: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (utf8Length(value.description) > MAX_DESCRIPTION_BYTES) {
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: `Description must be at most ${MAX_DESCRIPTION_BYTES} bytes.`,
      });
    }

    // YouTube counts list commas and implicit quotes around tags with spaces.
    const tagCharacters = value.tags.reduce((total, tag) => total + tag.length + (tag.includes(" ") ? 2 : 0), 0)
      + Math.max(0, value.tags.length - 1);
    if (tagCharacters > MAX_TAGS_CHARACTERS) {
      ctx.addIssue({
        code: "custom",
        path: ["tags"],
        message: `Tags must total at most ${MAX_TAGS_CHARACTERS} characters.`,
      });
    }

    if (value.publishAt != null) {
      if (!UTC_ISO_8601.test(value.publishAt)) {
        ctx.addIssue({
          code: "custom",
          path: ["publishAt"],
          message: "publishAt must be UTC ISO 8601, for example 2026-10-20T17:00:00Z.",
        });
      } else if (!Number.isFinite(Date.parse(value.publishAt)) || new Date(value.publishAt).toISOString().replace(".000Z", "Z") !== value.publishAt) {
        ctx.addIssue({
          code: "custom",
          path: ["publishAt"],
          message: "publishAt is not a valid date.",
        });
      } else if (Date.parse(value.publishAt) <= Date.now()) {
        ctx.addIssue({
          code: "custom",
          path: ["publishAt"],
          message: "publishAt must be in the future.",
        });
      } else if (value.privacyStatus !== "private") {
        ctx.addIssue({
          code: "custom",
          path: ["publishAt"],
          message: "A scheduled upload must use privacyStatus 'private'.",
        });
      }
    }
  });

export type VideoMetadata = z.infer<typeof videoMetadataSchema>;

/** The `snippet` + `status` body sent to `videos.insert`. */
export function buildVideoResource(metadata: VideoMetadata) {
  const status: {
    privacyStatus: string;
    selfDeclaredMadeForKids: boolean;
    publishAt?: string;
  } = {
    privacyStatus: metadata.privacyStatus,
    selfDeclaredMadeForKids: metadata.selfDeclaredMadeForKids,
  };

  if (metadata.publishAt) {
    status.privacyStatus = "private";
    status.publishAt = metadata.publishAt;
  }

  return {
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId,
    },
    status,
  };
}

// Timezone conversion lives in `lib/time.ts` so the client form can use it
// without pulling in zod.
