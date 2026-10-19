import { analyzeAudio } from "./audio-analysis";
import { assertDecodedSource, decodeAudioFile, type DecodedAudio } from "./audio";
import {
  ensureTemplateFonts,
  loadTemplateAssets,
  releaseAssets,
  assertRequiredAssets,
  type RenderAssets,
} from "./assets";
import { checkRenderCapabilities } from "./capabilities";
import { resolveRenderProfile, STATIC_FPS } from "./profile";
import { encodeMp4 } from "./encode";
import {
  drawPreparedScene,
  prepareScene,
  type DrawingContext,
  type PreparedScene,
  type SceneAssets,
} from "./scene";
import { sampleFeatures, type AudioFeatureTable, type FeatureSample } from "./audio-features";
import { type AnyTemplate, type RenderVariables } from "./template-schema";
import { snapshotRenderInput } from "./validate";

export * from "./template-schema";
export {
  checkRenderCapabilities,
  RENDER_AUDIO,
  RENDER_VIDEO,
  type RenderCapabilities,
} from "./capabilities";
export {
  ANIMATED_FPS,
  ANIMATED_MAX_FRAMES,
  ANIMATED_MAX_SECONDS,
  ANIMATED_VIDEO_BITRATE,
  STATIC_FPS,
  STATIC_VIDEO_BITRATE,
  resolveRenderProfile,
  type RenderProfile,
} from "./profile";
export {
  assertExportCanvas,
  MAX_FPS,
  MIN_FPS,
  normalizeFps,
  snapshotRenderInput,
  type RenderSnapshot,
} from "./validate";
export {
  decodeAudioFile,
  MAX_AUDIO_SECONDS,
  MAX_AUDIO_BYTES,
  type DecodedAudio,
} from "./audio";
export {
  analyzeAudio,
  ANALYSIS_CHUNK_SAMPLES,
  type AnalysisMode,
  type AnalysisResult,
} from "./audio-analysis";
export {
  FEATURE_ALGORITHM_VERSION,
  HOP_RATE,
  HOP_SAMPLES,
  analyzeFeatureChannels,
  sampleFeatures,
  type AudioFeatureTable,
  type FeatureSample,
} from "./audio-features";
export {
  decodeImageFile,
  ensureTemplateFonts,
  loadTemplateAssets,
  releaseAssets,
  resolveFontFamily,
  type RenderAssets,
} from "./assets";
export {
  drawPreparedScene,
  drawScene,
  layoutText,
  prepareScene,
  MAX_TEXT_LINES,
  type DrawingContext,
  type FrameContext,
  type PreparedScene,
  type SceneAssets,
  type TextLayout,
  type TextMeasure,
} from "./scene";
export {
  drawOrbital,
  normalizeGraphicSettings,
  ORBITAL_BOUNDS,
  ORBITAL_DEFAULTS,
  prepareOrbital,
  type GraphicColors,
  type GraphicFrame,
  type GraphicSettings,
  type PreparedOrbital,
} from "./graphics";

export type RenderStage =
  | "capabilities"
  | "decode"
  | "analyze"
  | "assets"
  | "video"
  | "audio"
  | "finalize";

export type RenderProgress = {
  stage: RenderStage;
  pct: number;
};

export type RenderInput = {
  audio: File;
  /** Required only by templates that declare a background binding. */
  background?: File;
  template: AnyTemplate;
  vars: RenderVariables;
};

export type RenderOptions = {
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  /** Reuse a decode the caller already owns; it is never modified. */
  decodedAudio?: DecodedAudio;
  /** Reuse an analysis for that decode; stale tables are rejected. */
  features?: AudioFeatureTable;
};

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}

/** Matches the M0 probe's proven settings: 1 fps is enough for a static design. */
export const DEFAULT_FPS = STATIC_FPS;

/**
 * Renders the full MP4 in the browser. Steps mirror spec section 5 plus the
 * animated profile: capability check → decode → analysis → assets → prepare →
 * encode. Static scenes are composed once; animated scenes redraw the same
 * canvas for every frame at 30 fps.
 */
export async function renderVideo(
  input: RenderInput,
  options: RenderOptions = {},
): Promise<Blob> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();

  // Validate and detach before allocating a canvas or decoding media. The job
  // then uses this snapshot for its whole lifetime.
  const snapshot = snapshotRenderInput(input);
  const template = snapshot.template;
  const profile = resolveRenderProfile(template, options.fps);

  onProgress?.({ stage: "capabilities", pct: 0 });
  const capabilities = await checkRenderCapabilities({
    fps: profile.fps,
    bitrate: profile.bitrate,
  });
  if (!capabilities.supported) throw new RenderError(capabilities.reasons.join(" "));
  onProgress?.({ stage: "capabilities", pct: 1 });
  signal?.throwIfAborted();

  const { width, height } = template.canvas;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new RenderError("Could not create the render canvas.");

  let assets: RenderAssets | undefined;
  try {
    onProgress?.({ stage: "decode", pct: 0 });
    if (options.decodedAudio) assertDecodedSource(options.decodedAudio, input.audio);
    const audio = options.decodedAudio ?? (await decodeAudioFile(input.audio, profile.maxSeconds));
    signal?.throwIfAborted();
    if (audio.duration > profile.maxSeconds) {
      throw new RenderError(
        `This profile supports tracks up to ${Math.round(profile.maxSeconds / 60)} minutes.`,
      );
    }
    onProgress?.({ stage: "decode", pct: 1 });

    let features: AudioFeatureTable | undefined;
    if (profile.animated) {
      onProgress?.({ stage: "analyze", pct: 0 });
      features = options.features;
      if (features) {
        assertUsableFeatures(features, audio.duration);
      } else {
        const result = await analyzeAudio(audio.buffer, {
          signal,
          onProgress: (pct) => onProgress?.({ stage: "analyze", pct }),
        });
        features = result.table;
      }
      signal?.throwIfAborted();
      onProgress?.({ stage: "analyze", pct: 1 });
    }

    onProgress?.({ stage: "assets", pct: 0 });
    assertRequiredAssets(template, { background: input.background });
    await ensureTemplateFonts(template);
    assets = await loadTemplateAssets(template, { background: input.background });
    signal?.throwIfAborted();
    onProgress?.({ stage: "assets", pct: 1 });

    const prepared = prepareScene(context, template, snapshot.vars, assets);
    if (!profile.animated) drawPreparedScene(context, prepared);

    return await encodeMp4({
      canvas,
      audio: audio.buffer,
      fps: profile.fps,
      bitrate: profile.bitrate,
      signal,
      onProgress: (stage, pct) => onProgress?.({ stage, pct }),
      drawFrame: profile.animated
        ? (timeSeconds, durationSeconds) => {
            drawPreparedScene(context, prepared, {
              timeSeconds,
              durationSeconds,
              features: sampleFeatures(features as AudioFeatureTable, timeSeconds),
            });
          }
        : undefined,
    });
  } finally {
    if (assets) releaseAssets(assets);
  }
}

/** Rejects a feature table that cannot belong to the decoded track. */
function assertUsableFeatures(features: AudioFeatureTable, duration: number): void {
  if (!Number.isFinite(features.duration) || features.rms.length < 2) {
    throw new RenderError("The audio analysis is empty. Analyze the track again.");
  }
  if (Math.abs(features.duration - duration) > 0.1) {
    throw new RenderError("The audio analysis does not match this track. Analyze it again.");
  }
}

/** Draws one preview frame with the same prepared scene the export uses. */
export function previewFrame(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  template: AnyTemplate,
  vars: RenderVariables,
  assets: SceneAssets,
  frame?: { timeSeconds: number; durationSeconds: number; features?: FeatureSample },
): void {
  const context = get2dContext(canvas);
  if (!context) throw new RenderError("Could not create the preview canvas.");
  const prepared = prepareScene(context, template, vars, assets);
  drawPreparedScene(context, prepared, frame);
}

/**
 * Draws one frame of an already prepared scene. The studio calls this from its
 * animation loop so React state is not updated per frame.
 */
export function drawPreparedFrame(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  prepared: PreparedScene,
  frame: { timeSeconds: number; durationSeconds: number; features?: FeatureSample },
): void {
  const context = get2dContext(canvas);
  if (!context) throw new RenderError("Could not create the preview canvas.");
  drawPreparedScene(context, prepared, frame);
}

function get2dContext(canvas: HTMLCanvasElement | OffscreenCanvas): DrawingContext | null {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.getContext("2d");
  }
  return (canvas as HTMLCanvasElement).getContext("2d");
}
