import { decodeAudioFile } from "./audio";
import {
  ensureTemplateFonts,
  loadTemplateAssets,
  releaseAssets,
  type RenderAssets,
} from "./assets";
import { checkRenderCapabilities } from "./capabilities";
import { encodeMp4 } from "./encode";
import { drawScene, type DrawingContext, type SceneAssets } from "./scene";
import type { RenderVariables, Template } from "./template-schema";
import { normalizeFps, snapshotRenderInput } from "./validate";

export * from "./template-schema";
export { checkRenderCapabilities, RENDER_AUDIO, RENDER_VIDEO, type RenderCapabilities } from "./capabilities";
export {
  assertExportCanvas,
  MAX_FPS,
  MIN_FPS,
  normalizeFps,
  snapshotRenderInput,
  type RenderSnapshot,
} from "./validate";
export { decodeAudioFile, MAX_AUDIO_SECONDS, type DecodedAudio } from "./audio";
export {
  decodeImageFile,
  ensureTemplateFonts,
  loadTemplateAssets,
  releaseAssets,
  resolveFontFamily,
  type RenderAssets,
} from "./assets";
export {
  drawScene,
  layoutText,
  MAX_TEXT_LINES,
  type DrawingContext,
  type SceneAssets,
  type TextLayout,
  type TextMeasure,
} from "./scene";

export type RenderStage = "capabilities" | "decode" | "assets" | "video" | "audio" | "finalize";

export type RenderProgress = {
  stage: RenderStage;
  pct: number;
};

export type RenderInput = {
  audio: File;
  background: File;
  template: Template;
  vars: RenderVariables;
};

export type RenderOptions = {
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
};

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}

/** Matches the M0 probe's proven settings: 1 fps is enough for a static design. */
export const DEFAULT_FPS = 1;

/**
 * Renders the full MP4 in the browser. Steps mirror spec section 5:
 * capability check → decode → assets → compose once → encode.
 */
export async function renderVideo(
  input: RenderInput,
  options: RenderOptions = {},
): Promise<Blob> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();

  // Validate and detach before allocating a canvas or decoding media. The job
  // then uses this snapshot for its whole lifetime.
  const fps = normalizeFps(options.fps ?? DEFAULT_FPS);
  const snapshot = snapshotRenderInput(input);
  const template = snapshot.template;

  onProgress?.({ stage: "capabilities", pct: 0 });
  const capabilities = await checkRenderCapabilities({ fps });
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
    const audio = await decodeAudioFile(input.audio);
    signal?.throwIfAborted();
    onProgress?.({ stage: "decode", pct: 1 });

    onProgress?.({ stage: "assets", pct: 0 });
    await ensureTemplateFonts(template);
    assets = await loadTemplateAssets(template, { background: input.background });
    signal?.throwIfAborted();
    onProgress?.({ stage: "assets", pct: 1 });

    drawScene(context, template, snapshot.vars, assets);

    return await encodeMp4({
      canvas,
      audio: audio.buffer,
      fps,
      signal,
      onProgress: (stage, pct) => onProgress?.({ stage, pct }),
    });
  } finally {
    if (assets) releaseAssets(assets);
  }
}

/** Draws one preview frame with the same `drawScene` the export uses. */
export function previewFrame(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  template: Template,
  vars: RenderVariables,
  assets: SceneAssets,
): void {
  const context = get2dContext(canvas);
  if (!context) throw new RenderError("Could not create the preview canvas.");
  drawScene(context, template, vars, assets);
}

function get2dContext(canvas: HTMLCanvasElement | OffscreenCanvas): DrawingContext | null {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.getContext("2d");
  }
  return (canvas as HTMLCanvasElement).getContext("2d");
}
