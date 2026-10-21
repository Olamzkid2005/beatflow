/**
 * Ready-made starting descriptions. The type-beat layout follows the structure
 * producers actually publish: a free-download title line, the license warning,
 * contact block, hashtags, and the tag dump.
 *
 * Two kinds of fill-in exist on purpose:
 * - `{{tokens}}` are replaced on the upload desk from data the app already has.
 * - `[BRACKETS]` are the author's own details (links, handles) and stay visible
 *   so nobody uploads a release with an empty contact block by accident.
 */

export type DescriptionTemplate = {
  id: string;
  name: string;
  summary: string;
  body: string;
};

export type DescriptionVars = {
  track_name?: string;
  producer_name?: string;
  key?: string;
  bpm?: string;
  year?: string;
};

const TOKENS = ["year", "track_name", "producer_name", "key", "bpm"] as const;
type Token = (typeof TOKENS)[number];

const TOKEN_PATTERN = new RegExp(`\\{\\{\\s*(${TOKENS.join("|")})\\s*\\}\\}`, "g");

/** Shown as-is when the app has no value yet, so the gap stays obvious. */
const FALLBACKS: Record<Token, string> = {
  year: "",
  track_name: "[TRACK NAME]",
  producer_name: "[PRODUCER NAME]",
  key: "[KEY]",
  bpm: "[BPM]",
};

export const DESCRIPTION_TEMPLATES: readonly DescriptionTemplate[] = [
  {
    id: "type-beat-license",
    name: "Type beat · license + contact",
    summary:
      "Free-type-beat headline, license requirements, contact block, hashtags, and a tag dump.",
    body: `[FREE] {{year}} Afrobeat Type Beat — {{track_name}} ({{key}} · {{bpm}} BPM)

This beat is NOT free. A purchase license or lease from our website is required for both non-profit and commercial use.
An exclusive license is required to enlist your song on BMI, WIPO, OMPI, ASCAP, or any other copyright or Content ID framework.

New beats every week. Subscribe and let's grow this channel together.
This afrobeat instrumental was produced by {{producer_name}}.

PURCHASE A LICENSE TO USE THIS BEAT — [BUY 1 GET 1 FREE]
Website: [your purchase link]

CONTACT
WhatsApp: [WhatsApp link]
Email: [email address]
Instagram: [Instagram handle]
Twitter: [Twitter handle]

#instrumental #afrobeat #typebeat #typebeats #freeafrobeat #amapiano

Tags (Ignore):
amapiano, amapiano instrumental, afrobeat, afropop, afrobeat instrumental, afro house, amapiano type beat, asake type beat, victony type beat, focalistic type beat, kabza de small type beat, dj maphorisa type beat, zinoleesky type beat, davido type beat, rema type beat, burna boy type beat, ckay type beat, buju type beat`,
  },
];

/** Human-readable list for the settings hint. */
export const DESCRIPTION_TOKEN_HELP: ReadonlyArray<{ token: string; label: string }> = [
  { token: "{{year}}", label: "current year" },
  { token: "{{track_name}}", label: "the release title" },
  { token: "{{producer_name}}", label: "your producer name" },
  { token: "{{key}}", label: "the render's key, or [KEY]" },
  { token: "{{bpm}}", label: "the render's BPM, or [BPM]" },
];

/**
 * Replaces the supported tokens in one pass. Unknown `{{...}}` text is left
 * alone so a producer's own notation is never silently rewritten.
 */
export function fillDescriptionTokens(text: string, vars: DescriptionVars = {}): string {
  if (!text) return "";
  const values: Record<Token, string> = {
    year: vars.year?.trim() || String(new Date().getFullYear()),
    track_name: vars.track_name?.trim() || FALLBACKS.track_name,
    producer_name: vars.producer_name?.trim() || FALLBACKS.producer_name,
    key: vars.key?.trim() || FALLBACKS.key,
    bpm: vars.bpm?.trim() || FALLBACKS.bpm,
  };
  return text.replace(TOKEN_PATTERN, (_match, name) => values[name as Token]);
}
