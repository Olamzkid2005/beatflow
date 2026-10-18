/**
 * Colour handling for the export (spec section 5: H.264 tagged BT.709).
 *
 * The composed canvas holds sRGB-encoded pixels. A canvas-sourced frame makes
 * Chromium signal sRGB transfer (13) and full range in both `colr` and the SPS
 * VUI. To tag BT.709 truthfully, the pixels are converted from the sRGB transfer
 * function to the BT.709 OETF and then encoded through a `VideoSample` whose
 * colour space is explicit.
 */

/** Explicit, limited-range BT.709 for the encoded frames and the MP4 tags. */
export const BT709_COLOR_SPACE = {
  primaries: "bt709",
  transfer: "bt709",
  matrix: "bt709",
  fullRange: false,
} as const;

const srgbToLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** BT.709 OETF (Rec. ITU-R BT.709-6). */
const bt709Oetf = (linear: number): number =>
  linear <= 0.018 ? 4.5 * linear : 1.099 * linear ** 0.45 - 0.099;

const LUT = (() => {
  const table = new Uint8ClampedArray(256);
  for (let value = 0; value < 256; value += 1) {
    table[value] = Math.round(bt709Oetf(srgbToLinear(value)) * 255);
  }
  return table;
})();

/**
 * Converts sRGB-encoded RGBA bytes to BT.709-encoded RGBA bytes. Alpha is
 * untouched. By default the input is not modified, so the caller can reuse it;
 * the animated export opts into an in-place pass because it owns each freshly
 * read frame and converts thousands of them.
 */
export function convertSrgbToBt709(
  rgba: Uint8ClampedArray,
  inPlace = false,
): Uint8ClampedArray {
  const converted = inPlace ? rgba : new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    converted[index] = LUT[rgba[index]];
    converted[index + 1] = LUT[rgba[index + 1]];
    converted[index + 2] = LUT[rgba[index + 2]];
    converted[index + 3] = rgba[index + 3];
  }
  return converted;
}
