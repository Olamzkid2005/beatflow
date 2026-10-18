import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

import { RENDER_AUDIO, RENDER_VIDEO } from "./capabilities";
import { assertExportCanvas, normalizeFps } from "./validate";

export type EncodeStage = "video" | "audio" | "finalize";
export type EncodeProgress = (stage: EncodeStage, pct: number) => void;

export type EncodeOptions = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  audio: AudioBuffer;
  fps?: number;
  signal?: AbortSignal;
  onProgress?: EncodeProgress;
};

/**
 * Encodes the composed canvas plus decoded audio into a fast-start MP4
 * (spec section 5 step 6). The caller owns the canvas; the frame count is
 * derived from the audio duration so both tracks end together.
 */
export async function encodeMp4({
  canvas,
  audio,
  fps = 1,
  signal,
  onProgress,
}: EncodeOptions): Promise<Blob> {
  // This function is public too: validate independently of renderVideo().
  const frameRate = normalizeFps(fps);
  assertExportCanvas({ width: canvas.width, height: canvas.height });

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    quality: new Quality({ bitrate: RENDER_VIDEO.bitrate }),
    fullCodecString: RENDER_VIDEO.fullCodecString,
    keyFrameInterval: RENDER_VIDEO.keyFrameInterval,
  });
  const audioSource = new AudioBufferSource({
    codec: "aac",
    quality: new Quality({ bitrate: RENDER_AUDIO.bitrate }),
  });
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);

  const duration = audio.duration;
  const frameDuration = 1 / frameRate;
  const totalFrames = Math.max(1, Math.ceil(duration * frameRate));

  try {
    await output.start();

    for (let index = 0; index < totalFrames; index += 1) {
      signal?.throwIfAborted();
      const timestamp = index * frameDuration;
      const length = Math.min(frameDuration, duration - timestamp);
      if (length <= 0) break;
      await videoSource.add(timestamp, length);
      onProgress?.("video", (index + 1) / totalFrames);
    }

    signal?.throwIfAborted();
    await audioSource.add(audio);
    onProgress?.("audio", 1);

    videoSource.close();
    audioSource.close();
    await output.finalize();
    onProgress?.("finalize", 1);

    const buffer = target.buffer;
    if (!buffer) throw new Error("The MP4 encoder produced no output.");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "finalized") {
      await output.cancel().catch(() => {});
    }
    throw error;
  }
}
