/**
 * Colour handling for the export (spec section 5: H.264 tagged BT.709).
 *
 * The composed canvas holds sRGB-encoded pixels, and those pixels are handed to
 * WebCodecs unchanged: the encoder converts RGB to limited-range BT.709 YUV
 * once, and the decoder reverses that conversion. Pre-converting the canvas
 * with a BT.709 LUT double-applies the transfer function, which made exports
 * noticeably darker than the preview (a #404040 patch decoded as 48 instead of
 * 64, and the #08080d field decoded as near-black).
 */

/** Explicit, limited-range BT.709 for the encoded frames and the MP4 tags. */
export const BT709_COLOR_SPACE = {
  primaries: "bt709",
  transfer: "bt709",
  matrix: "bt709",
  fullRange: false,
} as const;
