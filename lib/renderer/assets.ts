import { TEMPLATE_FONTS, type Template } from "./template-schema";

/** Long edge limit for background photos and logos (spec section 5 step 3). */
export const MAX_IMAGE_EDGE = 1920;
/** Decoded RGBA budget is roughly 4 bytes per pixel; 32 MP is ~128 MiB. */
export const MAX_IMAGE_PIXELS = 32_000_000;

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

/** Throws before a decode is allowed to exceed the pixel budget. */
export function assertImageBudget(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("The image has invalid dimensions.");
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      `The image is too large to decode safely (${width}×${height}). Use one under ${Math.round(MAX_IMAGE_PIXELS / 1_000_000)} megapixels.`,
    );
  }
}

/**
 * Reads dimensions from PNG/JPEG/WebP/GIF headers without decoding pixels. This
 * is deliberately dependency-free; unknown formats return null and are checked
 * after decode instead.
 */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));

  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG") {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (bytes.length >= 10 && ascii(0, 3) === "GIF") {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      return {
        width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
        height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
      };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (length < 2) return null;
      // SOF0/1/2/3/5/6/7/9/10/11/13/14/15 carry the frame dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
  }

  return null;
}

/** Uses header dimensions when possible; otherwise the bitmap is checked after decode. */
async function probeImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    return await readImageDimensions(file);
  } catch {
    return null;
  }
}

/**
 * Decodes an image and downscales it so the long edge is at most `maxEdge`
 * pixels. Dimensions are probed first where possible, the bitmap is resized
 * during decode rather than after a full-size allocation, and oversized images
 * are rejected instead of exhausting memory.
 */
export async function decodeImageFile(file: File, maxEdge = MAX_IMAGE_EDGE): Promise<ImageBitmap> {
  const probed = await probeImageSize(file);
  if (probed) assertImageBudget(probed.width, probed.height);

  let bitmap: ImageBitmap;
  if (probed && Math.max(probed.width, probed.height) > maxEdge) {
    const scale = maxEdge / Math.max(probed.width, probed.height);
    bitmap = await createImageBitmap(file, {
      resizeWidth: Math.max(1, Math.round(probed.width * scale)),
      resizeHeight: Math.max(1, Math.round(probed.height * scale)),
      resizeQuality: "high",
    });
  } else {
    bitmap = await createImageBitmap(file);
  }

  try {
    assertImageBudget(bitmap.width, bitmap.height);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= maxEdge) return bitmap;

    const scale = maxEdge / longEdge;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a canvas to downscale the image.");
    context.drawImage(bitmap, 0, 0, width, height);
    const resized = await createImageBitmap(canvas);
    bitmap.close();
    return resized;
  } catch (error) {
    bitmap.close();
    throw error;
  }
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
