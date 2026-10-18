/**
 * Render profiles (design section 12.5). The profile is derived from the
 * resolved scene, never a hidden global FPS change: static scenes keep the
 * proven 1 fps path, audio-reactive scenes use a separate, validated 30 fps
 * profile with its own duration and bitrate.
 */
import { MAX_AUDIO_SECONDS } from "./audio";
import { isAnimatedTemplate, type AnyTemplate } from "./template-schema";
import { normalizeFps } from "./validate";

export const STATIC_FPS = 1;
export const ANIMATED_FPS = 30;

/** Static baseline from the M0 probe. */
export const STATIC_VIDEO_BITRATE = 1_800_000;
/**
 * Provisional animated bitrate between the static baseline and the design's
 * 4.5 Mbps option. The 1.8/3/4.5 comparison still needs owner visual review.
 */
export const ANIMATED_VIDEO_BITRATE = 3_000_000;

/** Animated exports are capped at 5 minutes / 9000 frames. */
export const ANIMATED_MAX_SECONDS = 5 * 60;
export const ANIMATED_MAX_FRAMES = ANIMATED_FPS * ANIMATED_MAX_SECONDS;

export type RenderProfile = {
  animated: boolean;
  fps: number;
  bitrate: number;
  maxSeconds: number;
};

/**
 * Rejects a frame rate that would silently downgrade an animated scene to a
 * still, and keeps the 15-minute static limit separate from the 5-minute
 * animated limit.
 */
export function resolveRenderProfile(
  template: AnyTemplate,
  requestedFps?: number,
): RenderProfile {
  if (isAnimatedTemplate(template)) {
    if (requestedFps !== undefined && requestedFps !== ANIMATED_FPS) {
      throw new RangeError(
        `Audio-reactive scenes render at ${ANIMATED_FPS} fps. Use a static template for a still frame.`,
      );
    }
    return {
      animated: true,
      fps: ANIMATED_FPS,
      bitrate: ANIMATED_VIDEO_BITRATE,
      maxSeconds: ANIMATED_MAX_SECONDS,
    };
  }
  return {
    animated: false,
    fps: normalizeFps(requestedFps ?? STATIC_FPS),
    bitrate: STATIC_VIDEO_BITRATE,
    maxSeconds: MAX_AUDIO_SECONDS,
  };
}
