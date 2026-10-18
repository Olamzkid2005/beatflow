import {
  AudioBufferSource,
  BufferTarget,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSource,
} from "mediabunny";

import { RENDER_AUDIO, RENDER_VIDEO } from "./capabilities";
import { BT709_COLOR_SPACE, convertSrgbToBt709 } from "./color";
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
 * derived from the audio duration so both tracks end together. The canvas is
 * read once, converted from the sRGB transfer function to BT.709, and encoded
 * with an explicit BT.709 colour space so the H.264 SPS and `colr` box are
 * tagged correctly.
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

  const context = canvas.getContext("2d");
  if (!context) throw new Error("The export canvas has no 2D context to read.");
  const pixels = convertSrgbToBt709(
    context.getImageData(0, 0, canvas.width, canvas.height).data,
  );

  const videoSource = new VideoSampleSource({
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
      const sample = new VideoSample(pixels, {
        format: "RGBA",
        codedWidth: canvas.width,
        codedHeight: canvas.height,
        timestamp,
        duration: length,
        colorSpace: BT709_COLOR_SPACE,
      });
      try {
        await videoSource.add(sample);
      } finally {
        sample.close();
      }
      onProgress?.("video", (index + 1) / totalFrames);
    }

    signal?.throwIfAborted();
    await audioSource.add(audio);
    // Audio encoding is the last long await; aborting here must cancel the
    // output instead of finalizing a partial file.
    signal?.throwIfAborted();
    onProgress?.("audio", 1);

    videoSource.close();
    audioSource.close();
    signal?.throwIfAborted();
    await output.finalize();
    // Finalization is the commit boundary: once it completes the artifact is
    // valid, so a late abort must not pretend the work was cancelled.
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
