/**
 * MP3 decoding for the renderer. Web Audio has no Worker support in v1, so this
 * runs on the main thread (spec section 5 step 5).
 */

export const TARGET_SAMPLE_RATE = 48_000;
export const OUTPUT_CHANNELS = 2;
export const MAX_AUDIO_SECONDS = 15 * 60;
/** Compressed input cap before any ArrayBuffer/decode allocation. */
export const MAX_AUDIO_BYTES = 64 * 1024 * 1024;

export type DecodedAudio = {
  buffer: AudioBuffer;
  duration: number;
  sampleRate: number;
  channels: number;
};

/** Rejects impossible inputs before any decode allocation. Pure and testable. */
export function assertAudioBudget(
  size: number,
  duration: number | null,
  maxSeconds = MAX_AUDIO_SECONDS,
): void {
  if (!Number.isFinite(size) || size <= 0) throw new Error("The audio file is empty.");
  if (size > MAX_AUDIO_BYTES) {
    throw new Error(`The audio file is larger than the ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB limit.`);
  }
  if (duration !== null && Number.isFinite(duration) && duration > maxSeconds) {
    throw new Error(`The audio is longer than the ${Math.round(maxSeconds / 60)}-minute limit.`);
  }
}

/** Reads metadata duration without decoding the whole file when the browser can. */
async function probeAudioDuration(file: File): Promise<number | null> {
  if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number | null>((resolve) => {
      const audio = new Audio();
      let settled = false;
      const done = (value: number | null) => {
        if (settled) return;
        settled = true;
        audio.removeAttribute("src");
        resolve(value);
      };
      audio.preload = "metadata";
      audio.onloadedmetadata = () =>
        done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
      audio.onerror = () => done(null);
      // Metadata should arrive quickly; never block the render on a stalled probe.
      setTimeout(() => done(null), 5_000);
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decodes any browser-supported audio file, resampling to 48 kHz and stereo. */
export async function decodeAudioFile(
  file: File,
  maxSeconds = MAX_AUDIO_SECONDS,
): Promise<DecodedAudio> {
  assertAudioBudget(file.size, null, maxSeconds);
  // Reject an overlong file before loading its bytes into an AudioBuffer.
  assertAudioBudget(file.size, await probeAudioDuration(file), maxSeconds);

  const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  try {
    const data = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(data);
    if (!decoded.length || !Number.isFinite(decoded.duration) || decoded.duration <= 0) {
      throw new Error("The audio file could not be decoded.");
    }
    if (decoded.duration > maxSeconds) {
      throw new Error(`The audio is longer than the ${Math.round(maxSeconds / 60)}-minute limit.`);
    }
    const buffer =
      decoded.numberOfChannels === OUTPUT_CHANNELS ? decoded : await toStereo(decoded);
    return {
      buffer,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
  } finally {
    await context.close();
  }
}

/** Offline render downmixes mono and multi-channel sources to stereo. */
async function toStereo(buffer: AudioBuffer): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(OUTPUT_CHANNELS, buffer.length, buffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}
