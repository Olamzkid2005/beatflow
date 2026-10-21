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
import { BT709_COLOR_SPACE } from "./color";
import { assertExportCanvas, normalizeFps } from "./validate";

export type EncodeStage = "video" | "audio" | "finalize";
export type EncodeProgress = (stage: EncodeStage, pct: number) => void;

/** Encoded packet budget before mux overhead (design section 12.6). */
export const PAYLOAD_BUDGET_BYTES = 192 * 1024 * 1024;
/** Extra allowance for the muxed container and its index. */
export const MUX_ALLOWANCE_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = PAYLOAD_BUDGET_BYTES + MUX_ALLOWANCE_BYTES;

export type EncodeOptions = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  audio: AudioBuffer;
  fps?: number;
  signal?: AbortSignal;
  onProgress?: EncodeProgress;
  /**
   * Draws the frame for `timeSeconds` before it is captured. Providing this
   * switches the encoder from a single static capture to a per-frame animated
   * capture; the same canvas is reused for every frame.
   */
  drawFrame?: (timeSeconds: number, durationSeconds: number) => void;
  bitrate?: number;
};

function payloadError(): Error {
  return new Error(
    `The encoded media exceeded the ${Math.round(
      PAYLOAD_BUDGET_BYTES / 1024 / 1024,
    )} MiB payload budget. Use a shorter track or render a still design.`,
  );
}

/**
 * Encodes the composed canvas plus decoded audio into a fast-start MP4
 * (spec section 5 step 6). The caller owns the canvas; the frame count is
 * derived from the audio duration so both tracks end together.
 *
 * Static scenes are read once. Animated scenes are drawn through `drawFrame`
 * and read once per frame. The canvas pixels stay sRGB: WebCodecs performs the
 * single RGB→limited-range BT.709 conversion when each `VideoSample` is encoded,
 * and the explicit colour space keeps the H.264 SPS and `colr` box truthful.
 * Converting here as well would apply the transfer twice and crush dark tones.
 */
export async function encodeMp4({
  canvas,
  audio,
  fps = 1,
  signal,
  onProgress,
  drawFrame,
  bitrate = RENDER_VIDEO.bitrate,
}: EncodeOptions): Promise<Blob> {
  // This function is public too: validate independently of renderVideo().
  const frameRate = normalizeFps(fps);
  assertExportCanvas({ width: canvas.width, height: canvas.height });

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const context = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!context) throw new Error("The export canvas has no 2D context to read.");

  let encodedBytes = 0;
  let budgetExceeded = false;
  const countPacket = (packet: { byteLength: number }) => {
    encodedBytes += packet.byteLength;
    if (encodedBytes > PAYLOAD_BUDGET_BYTES) budgetExceeded = true;
  };

  const videoSource = new VideoSampleSource({
    codec: "avc",
    quality: new Quality({ bitrate }),
    fullCodecString: RENDER_VIDEO.fullCodecString,
    keyFrameInterval: RENDER_VIDEO.keyFrameInterval,
    // Offline export must not drop frames to catch up with wall time.
    latencyMode: "quality",
    onEncodedPacket: countPacket,
  });
  const audioSource = new AudioBufferSource({
    codec: "aac",
    quality: new Quality({ bitrate: RENDER_AUDIO.bitrate }),
    onEncodedPacket: countPacket,
  });
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);

  const duration = audio.duration;
  const frameDuration = 1 / frameRate;
  const totalFrames = Math.max(1, Math.ceil(duration * frameRate));
  const progressEvery = Math.max(1, Math.floor(totalFrames / 200));

  // Static scenes never redraw, so reading the pixels once is enough.
  const staticPixels = drawFrame
    ? null
    : context.getImageData(0, 0, canvas.width, canvas.height).data;

  try {
    await output.start();

    for (let index = 0; index < totalFrames; index += 1) {
      signal?.throwIfAborted();
      if (budgetExceeded) throw payloadError();
      const timestamp = index * frameDuration;
      const length = Math.min(frameDuration, duration - timestamp);
      if (length <= 0) break;

      let pixels = staticPixels;
      if (drawFrame) {
        drawFrame(timestamp, duration);
        pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      if (!pixels) throw new Error("The export frame could not be read.");

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
      if (index % progressEvery === 0 || index === totalFrames - 1) {
        onProgress?.("video", (index + 1) / totalFrames);
      }
    }

    signal?.throwIfAborted();
    if (budgetExceeded) throw payloadError();
    await audioSource.add(audio);
    // Audio encoding is the last long await; aborting here must cancel the
    // output instead of finalizing a partial file.
    signal?.throwIfAborted();
    if (budgetExceeded) throw payloadError();
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
    if (buffer.byteLength > MAX_OUTPUT_BYTES) throw payloadError();
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "finalized") {
      await output.cancel().catch(() => {});
    }
    throw error;
  }
}
