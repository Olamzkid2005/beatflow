import { canEncodeAudio, canEncodeVideo, Quality } from "mediabunny";

import { STATIC_FPS, STATIC_VIDEO_BITRATE } from "./profile";
import { normalizeFps } from "./validate";

/**
 * Required output format (spec section 5). The pinned codec string is
 * deliberate: Mediabunny's automatic level selection was wrong for 1080p in
 * the M0 probe.
 */
export const RENDER_VIDEO = {
  width: 1920,
  height: 1080,
  bitrate: STATIC_VIDEO_BITRATE,
  fullCodecString: "avc1.640028",
  keyFrameInterval: 2,
} as const;

export const RENDER_AUDIO = {
  bitrate: 288_000,
  sampleRate: 48_000,
  channels: 2,
} as const;

export type RenderCapabilities = {
  supported: boolean;
  video: boolean;
  audio: boolean;
  reasons: string[];
};

/**
 * Feature-checks the browser before a render starts, with readable reasons.
 * The probe uses the selected frame rate, so 30 fps is not certified by a
 * successful 1 fps check.
 */
export async function checkRenderCapabilities(
  options: { fps?: number; bitrate?: number } = {},
): Promise<RenderCapabilities> {
  const fps = normalizeFps(options.fps ?? STATIC_FPS);
  const bitrate = options.bitrate ?? RENDER_VIDEO.bitrate;
  const reasons: string[] = [];

  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    reasons.push("This browser does not expose WebCodecs encoding. Use current desktop Chrome or Edge.");
  }
  if (typeof OffscreenCanvas === "undefined") {
    reasons.push("This browser does not support OffscreenCanvas.");
  }
  if (typeof AudioContext === "undefined") {
    reasons.push("This browser does not support the Web Audio API.");
  }

  let video = false;
  let audio = false;
  if (reasons.length === 0) {
    video = await canEncodeVideo("avc", {
      width: RENDER_VIDEO.width,
      height: RENDER_VIDEO.height,
      frameRate: fps,
      quality: new Quality({ bitrate }),
      fullCodecString: RENDER_VIDEO.fullCodecString,
    }).catch(() => false);

    audio = await canEncodeAudio("aac", {
      numberOfChannels: RENDER_AUDIO.channels,
      sampleRate: RENDER_AUDIO.sampleRate,
      quality: new Quality({ bitrate: RENDER_AUDIO.bitrate }),
    }).catch(() => false);

    if (!video) reasons.push("H.264 High profile at 1920×1080 cannot be encoded in this browser.");
    if (!audio) reasons.push("AAC-LC at 48 kHz stereo cannot be encoded in this browser.");
  }

  return { supported: reasons.length === 0, video, audio, reasons };
}
