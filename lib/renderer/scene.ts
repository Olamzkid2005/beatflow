import { resolveFontFamily } from "./assets";
import {
  interpolateTemplateValue,
  type ImageLayer,
  type RectLayer,
  type RenderVariables,
  type Template,
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
  measure: TextMeasure;
}): TextLayout {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const fontFor = (size: number) => `${weight} ${size}px ${family}`;
  const step = Math.max(1, Math.round(fontSize * 0.04));
  const floor = Math.min(minFontSize, fontSize);

  for (let size = fontSize; size >= floor; size -= step) {
    const font = fontFor(size);
    const lines = wrapWords(words, font, maxWidth, measure, letterSpacing);
    if (
      lines.length <= maxLines &&
      lines.every((line) => widthOf(line, font, measure, letterSpacing) <= maxWidth)
    ) {
      return { fontSize: size, lines, lineHeight: Math.round(size * 1.1) };
    }
  }

  const font = fontFor(floor);
  const allLines = wrapWords(words, font, maxWidth, measure, letterSpacing);
  const lines = allLines.slice(0, maxLines).map((line) => {
    if (widthOf(line, font, measure, letterSpacing) <= maxWidth) return line;
    let trimmed = line;
    while (trimmed.length > 1 && widthOf(`${trimmed}…`, font, measure, letterSpacing) > maxWidth) {
      trimmed = trimmed.slice(0, -1).trimEnd();
    }
    return `${trimmed}…`;
  });
  if (allLines.length > maxLines && lines.length > 0) {
    const lastIndex = lines.length - 1;
    if (!lines[lastIndex].endsWith("…")) {
      let last = lines[lastIndex];
      while (last.length > 1 && widthOf(`${last}…`, font, measure, letterSpacing) > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      lines[lastIndex] = `${last}…`;
    }
  }
  return { fontSize: floor, lines, lineHeight: Math.round(floor * 1.1) };
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

function drawTextLayer(
  ctx: DrawingContext,
  layer: TextLayer,
  vars: RenderVariables,
): void {
  const raw = interpolateTemplateValue(layer.value, vars);
  const text = layer.uppercase ? raw.toUpperCase() : raw;
  if (!text.trim()) return;

  const family = resolveFontFamily(layer.fontFamily);
  const layout = layoutText({
    text,
    fontSize: layer.fontSize,
    minFontSize: layer.minFontSize,
    maxWidth: layer.maxWidth,
    weight: layer.fontWeight,
    family,
    letterSpacing: layer.letterSpacing,
    measure: (value, font) => {
      ctx.font = font;
      return ctx.measureText(value).width;
    },
  });

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
 * Draws one full frame. Shared by the live preview and the export so they can
 * never drift apart.
 */
export function drawScene(
  ctx: DrawingContext,
  template: Template,
  vars: RenderVariables,
  assets: SceneAssets,
): void {
  const { width, height, backgroundColor } = template.canvas;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  for (const layer of template.layers) {
    ctx.save();
    if (layer.type === "image") drawImageLayer(ctx, layer, assets, width, height);
    else if (layer.type === "rect") drawRectLayer(ctx, layer);
    else drawTextLayer(ctx, layer, vars);
    ctx.restore();
  }
  ctx.restore();
}
