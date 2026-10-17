import { TEMPLATE_FONTS, type Template } from "./template-schema";

/** Long edge limit for background photos and logos (spec section 5 step 3). */
export const MAX_IMAGE_EDGE = 1920;

export type RenderAssets = {
  background?: ImageBitmap;
  logo?: ImageBitmap;
};

const FONT_VARIABLES: Record<string, string> = {
  Inter: "--font-inter",
  "JetBrains Mono": "--font-jetbrains-mono",
};

/** Used when the next/font variable is unavailable, for example in Node tests. */
const FONT_FALLBACKS: Record<string, string> = {
  Inter: "Inter, system-ui, sans-serif",
  "JetBrains Mono": "JetBrains Mono, ui-monospace, monospace",
};

/** Resolves a template family name to the CSS stack next/font registered. */
export function resolveFontFamily(family: string): string {
  if (typeof document === "undefined") return FONT_FALLBACKS[family] ?? family;
  const variable = FONT_VARIABLES[family];
  const registered = variable
    ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    : "";
  return registered || FONT_FALLBACKS[family] || family;
}

/**
 * Waits for every font a template uses. Without this the export silently falls
 * back to system fonts (spec section 5 step 3).
 */
export async function ensureTemplateFonts(template: Template): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const loads: Promise<unknown>[] = [];
  for (const layer of template.layers) {
    if (layer.type !== "text") continue;
    if (!TEMPLATE_FONTS.includes(layer.fontFamily)) continue;
    loads.push(
      document.fonts.load(`${layer.fontWeight} 64px ${resolveFontFamily(layer.fontFamily)}`),
    );
  }
  await Promise.all(loads);
}

/**
 * Decodes an image and downscales it so the long edge is at most `maxEdge`
 * pixels, keeping memory predictable for huge photos (spec section 5 step 3).
 */
export async function decodeImageFile(file: File, maxEdge = MAX_IMAGE_EDGE): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (longEdge <= maxEdge) return bitmap;

  const scale = maxEdge / longEdge;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not create a canvas to downscale the image.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return createImageBitmap(canvas);
}

export async function loadTemplateAssets(
  template: Template,
  files: { background?: File; logo?: File },
): Promise<RenderAssets> {
  const assets: RenderAssets = {};
  const bindings = new Set(
    template.layers.flatMap((layer) => (layer.type === "image" ? [layer.binding] : [])),
  );
  try {
    if (bindings.has("background_image") && files.background) {
      assets.background = await decodeImageFile(files.background);
    }
    if (bindings.has("logo") && files.logo) {
      assets.logo = await decodeImageFile(files.logo);
    }
  } catch (error) {
    releaseAssets(assets);
    throw error;
  }
  return assets;
}

/** Closes every decoded bitmap. Call once the render finishes, success or not. */
export function releaseAssets(assets: RenderAssets): void {
  assets.background?.close();
  assets.logo?.close();
}
