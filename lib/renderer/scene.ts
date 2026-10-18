import { resolveFontFamily } from "./assets";
import type { FeatureSample } from "./audio-features";
import { drawOrbital, prepareOrbital, type PreparedOrbital } from "./graphics";
import {
  interpolateTemplateValue,
  type AnyTemplate,
  type AnyTextLayer,
  type GraphicLayer,
  type ImageLayer,
  type RectLayer,
  type RenderVariables,
  type TextLayer,
} from "./template-schema";

export const MAX_TEXT_LINES = 3;

export type DrawingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type SceneAssets = {
  background?: ImageBitmap;
  logo?: ImageBitmap;
};

export type TextMeasure = (text: string, font: string) => number;

export type TextLayout = {
  fontSize: number;
  lines: string[];
  lineHeight: number;
};

const SILENT_FEATURES: FeatureSample = { rms: 0, low: 0, mid: 0, high: 0 };

/** Ephemeral per-frame values; never written back to the template or preset. */
export type FrameContext = {
  timeSeconds: number;
  durationSeconds: number;
  features?: FeatureSample;
};

function widthOf(
  text: string,
  font: string,
  measure: TextMeasure,
  letterSpacing: number,
): number {
  return measure(text, font) + (text.length > 0 ? letterSpacing * (text.length - 1) : 0);
}

function wrapWords(
  words: string[],
  font: string,
  maxWidth: number,
  measure: TextMeasure,
  letterSpacing: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || widthOf(candidate, font, measure, letterSpacing) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Word-wraps and shrinks text until it fits `maxWidth` within `maxLines`
 * (spec section 5 step 4). Pure, so Node tests can drive it with a fake
 * measure function instead of a canvas.
 */
export function layoutText({
  text,
  fontSize,
  minFontSize,
  maxWidth,
  weight,
  family,
  letterSpacing = 0,
  maxLines = MAX_TEXT_LINES,
  maxHeight,
  lineHeight = 1.1,
  measure,
}: {
  text: string;
  fontSize: number;
  minFontSize: number;
  maxWidth: number;
  weight: number;
  family: string;
  letterSpacing?: number;
  maxLines?: number;
  /** Optional reserved vertical space; lines never draw past it. */
  maxHeight?: number;
  /** Line height as a multiple of the font size. */
  lineHeight?: number;
  measure: TextMeasure;
}): TextLayout {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const fontFor = (size: number) => `${weight} ${size}px ${family}`;
  const lineHeightFor = (size: number) => Math.round(size * lineHeight);
  const fitsHeight = (count: number, size: number) =>
    maxHeight === undefined || count * lineHeightFor(size) <= maxHeight;
  const step = Math.max(1, Math.round(fontSize * 0.04));
  const floor = Math.min(minFontSize, fontSize);

  for (let size = fontSize; size >= floor; size -= step) {
    const font = fontFor(size);
    const lines = wrapWords(words, font, maxWidth, measure, letterSpacing);
    if (
      lines.length <= maxLines &&
      fitsHeight(lines.length, size) &&
      lines.every((line) => widthOf(line, font, measure, letterSpacing) <= maxWidth)
    ) {
      return { fontSize: size, lines, lineHeight: lineHeightFor(size) };
    }
  }

  const font = fontFor(floor);
  const floorLineHeight = lineHeightFor(floor);
  const heightLines =
    maxHeight === undefined ? maxLines : Math.max(0, Math.floor(maxHeight / floorLineHeight));
  const allowedLines = Math.min(maxLines, heightLines);
  if (allowedLines < 1) {
    throw new RangeError(
      `Text needs at least ${floorLineHeight}px of height; the box reserves ${maxHeight}px.`,
    );
  }

  const allLines = wrapWords(words, font, maxWidth, measure, letterSpacing);
  const lines = allLines.slice(0, allowedLines).map((line) => {
    if (widthOf(line, font, measure, letterSpacing) <= maxWidth) return line;
    let trimmed = line;
    while (trimmed.length > 1 && widthOf(`${trimmed}…`, font, measure, letterSpacing) > maxWidth) {
      trimmed = trimmed.slice(0, -1).trimEnd();
    }
    return `${trimmed}…`;
  });
  if (allLines.length > allowedLines && lines.length > 0) {
    const lastIndex = lines.length - 1;
    if (!lines[lastIndex].endsWith("…")) {
      let last = lines[lastIndex];
      while (last.length > 1 && widthOf(`${last}…`, font, measure, letterSpacing) > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      lines[lastIndex] = `${last}…`;
    }
  }
  return { fontSize: floor, lines, lineHeight: floorLineHeight };
}

function setLetterSpacing(ctx: DrawingContext, value: number): void {
  const withSpacing = ctx as DrawingContext & { letterSpacing?: string };
  if (withSpacing.letterSpacing !== undefined) withSpacing.letterSpacing = `${value}px`;
}

function roundedRectPath(
  ctx: DrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}

function drawImageLayer(
  ctx: DrawingContext,
  layer: ImageLayer,
  assets: SceneAssets,
  width: number,
  height: number,
): void {
  const image = layer.binding === "background_image" ? assets.background : assets.logo;
  if (!image) return;

  ctx.globalAlpha = layer.opacity;
  const scale =
    layer.fit === "cover"
      ? Math.max(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const slackX = (drawWidth - width) / 2;
  const slackY = (drawHeight - height) / 2;
  const dx = (width - drawWidth) / 2 + layer.offsetX * slackX;
  const dy = (height - drawHeight) / 2 + layer.offsetY * slackY;
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
}

function drawRectLayer(ctx: DrawingContext, layer: RectLayer): void {
  ctx.globalAlpha = layer.opacity;
  ctx.fillStyle = layer.fill;
  if (layer.radius > 0) {
    ctx.beginPath();
    roundedRectPath(ctx, layer.x, layer.y, layer.width, layer.height, layer.radius);
    ctx.fill();
  } else {
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
  }
}

export type PreparedText = {
  type: "text";
  layer: AnyTextLayer;
  text: string;
  layout: TextLayout;
};

export type PreparedLayer =
  | { type: "image"; layer: ImageLayer }
  | { type: "rect"; layer: RectLayer }
  | PreparedText
  | { type: "graphic"; layer: GraphicLayer; graphic: PreparedOrbital };

/**
 * A validated scene snapshot with measured text runs and seeded graphic
 * geometry. Preview and export both draw from this, so a frame can never be laid
 * out differently in the two paths.
 */
export type PreparedScene = {
  template: AnyTemplate;
  assets: SceneAssets;
  layers: PreparedLayer[];
};

function resolveLayerText(layer: AnyTextLayer, vars: RenderVariables): string | null {
  if ("requires" in layer && layer.requires) {
    const required = vars[layer.requires];
    if (typeof required !== "string" || !required.trim()) return null;
  }
  const raw = interpolateTemplateValue(layer.value, vars);
  const text = layer.uppercase ? raw.toUpperCase() : raw;
  return text.trim() ? text : null;
}

function measureText(ctx: DrawingContext) {
  return (value: string, font: string): number => {
    ctx.font = font;
    return ctx.measureText(value).width;
  };
}

/**
 * Resolves variables, measures every visible text run once and prepares the
 * seeded graphic. Call this after fonts are loaded, with a context whose font
 * metrics match the draw target.
 */
export function prepareScene(
  ctx: DrawingContext,
  template: AnyTemplate,
  vars: RenderVariables,
  assets: SceneAssets = {},
): PreparedScene {
  const layers: PreparedLayer[] = [];
  const measure = measureText(ctx);

  for (const layer of template.layers) {
    if (layer.type === "image") {
      layers.push({ type: "image", layer });
      continue;
    }
    if (layer.type === "rect") {
      layers.push({ type: "rect", layer });
      continue;
    }
    if (layer.type === "graphic") {
      layers.push({
        type: "graphic",
        layer,
        graphic: prepareOrbital(layer.settings, layer.colors),
      });
      continue;
    }

    const text = resolveLayerText(layer, vars);
    if (!text) continue;
    const family = resolveFontFamily(layer.fontFamily);
    const layout = layoutText({
      text,
      fontSize: layer.fontSize,
      minFontSize: layer.minFontSize,
      maxWidth: layer.maxWidth,
      weight: layer.fontWeight,
      family,
      letterSpacing: layer.letterSpacing,
      maxHeight: layer.maxHeight,
      lineHeight: layer.lineHeight,
      measure,
    });
    layers.push({ type: "text", layer, text, layout });
  }

  return { template, assets, layers };
}

function drawPreparedText(ctx: DrawingContext, prepared: PreparedText): void {
  const { layer, layout } = prepared;
  const family = resolveFontFamily(layer.fontFamily);

  ctx.globalAlpha = 1;
  ctx.font = `${layer.fontWeight} ${layout.fontSize}px ${family}`;
  setLetterSpacing(ctx, layer.letterSpacing);
  ctx.textBaseline = "top";
  ctx.textAlign = layer.align;
  const anchorX =
    layer.align === "left"
      ? layer.x
      : layer.align === "center"
        ? layer.x + layer.maxWidth / 2
        : layer.x + layer.maxWidth;

  if (layer.shadow) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetX = layer.shadow.offsetX;
    ctx.shadowOffsetY = layer.shadow.offsetY;
  }

  for (let index = 0; index < layout.lines.length; index += 1) {
    const y = layer.y + index * layout.lineHeight;
    if (layer.outline) {
      ctx.lineWidth = layer.outline.width;
      ctx.strokeStyle = layer.outline.color;
      ctx.strokeText(layout.lines[index], anchorX, y);
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(layout.lines[index], anchorX, y);
  }

  if (layer.shadow) {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  setLetterSpacing(ctx, 0);
}

/**
 * Draws one complete frame in z-order. `frame` is optional for static scenes;
 * a graphic without it renders its design frame at time zero.
 */
export function drawPreparedScene(
  ctx: DrawingContext,
  prepared: PreparedScene,
  frame?: FrameContext,
): void {
  const { width, height, backgroundColor } = prepared.template.canvas;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  for (const layer of prepared.layers) {
    ctx.save();
    if (layer.type === "image") {
      drawImageLayer(ctx, layer.layer, prepared.assets, width, height);
    } else if (layer.type === "rect") {
      drawRectLayer(ctx, layer.layer);
    } else if (layer.type === "text") {
      drawPreparedText(ctx, layer);
    } else {
      drawOrbital(ctx, layer.graphic, layer.layer.box, {
        timeSeconds: frame?.timeSeconds ?? 0,
        durationSeconds: frame?.durationSeconds ?? 0,
        features: frame?.features ?? SILENT_FEATURES,
      });
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draws one full frame. Shared by the live preview and the export so they can
 * never drift apart.
 */
export function drawScene(
  ctx: DrawingContext,
  template: AnyTemplate,
  vars: RenderVariables,
  assets: SceneAssets,
  frame?: FrameContext,
): void {
  drawPreparedScene(ctx, prepareScene(ctx, template, vars, assets), frame);
}

/** Kept for callers that only need the static v1 text drawing type. */
export type DrawableTextLayer = TextLayer;
