/**
 * Identity of a render's inputs. The studio uses it to tell whether the MP4 in
 * hand still matches what the canvas currently shows, so editing a template
 * after a render never silently leaves a stale file looking current.
 *
 * Pure and browser-free: both the studio and the Node tests use it.
 */

export type FileIdentity = { name: string; size: number; lastModified: number };

export type RenderIntent = {
  /** Preset the scene was built from (First Light, Pulse, Grid, Orbital). */
  templateId: string;
  /** Serialized appearance/settings that change the concrete scene. */
  appearance: string;
  producerName: string;
  trackName: string;
  message: string;
  bpm: string | null;
  key: string | null;
  audio: FileIdentity | null;
  image: FileIdentity | null;
  /** Static 1080p frame or the audio-reactive 30 fps profile. */
  outputProfile: "static" | "animated";
};

/** Keeps only the fields that identify a file's content for this session. */
export function fileIdentity(
  file: Pick<FileIdentity, "name" | "size" | "lastModified"> | null,
): FileIdentity | null {
  return file ? { name: file.name, size: file.size, lastModified: file.lastModified } : null;
}

/**
 * Stable across renders with equal inputs: fields are written in a fixed order,
 * so object key order can never change the result.
 */
export function renderSignature(intent: RenderIntent): string {
  return JSON.stringify([
    intent.templateId,
    intent.appearance,
    intent.producerName,
    intent.trackName,
    intent.message,
    intent.bpm ?? "",
    intent.key ?? "",
    intent.audio ? [intent.audio.name, intent.audio.size, intent.audio.lastModified] : null,
    intent.image ? [intent.image.name, intent.image.size, intent.image.lastModified] : null,
    intent.outputProfile,
  ]);
}

/**
 * True when a finished MP4 no longer reflects the current inputs. An unknown
 * rendered signature (no render yet, or an older session) is never "stale".
 */
export function isRenderStale(
  renderedSignature: string | null,
  currentSignature: string,
): boolean {
  return renderedSignature !== null && renderedSignature !== currentSignature;
}
