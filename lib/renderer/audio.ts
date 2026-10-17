/**
 * MP3 decoding for the renderer. Web Audio has no Worker support in v1, so this
 * runs on the main thread (spec section 5 step 5).
 */

export const TARGET_SAMPLE_RATE = 48_000;
export const OUTPUT_CHANNELS = 2;
export const MAX_AUDIO_SECONDS = 15 * 60;

export type DecodedAudio = {
  buffer: AudioBuffer;
  duration: number;
  sampleRate: number;
  channels: number;
};

/** Decodes any browser-supported audio file, resampling to 48 kHz and stereo. */
export async function decodeAudioFile(
  file: File,
  maxSeconds = MAX_AUDIO_SECONDS,
): Promise<DecodedAudio> {
  if (file.size === 0) throw new Error("The audio file is empty.");

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
