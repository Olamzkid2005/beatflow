import assert from "node:assert/strict";
import { test } from "node:test";

import { BT709_COLOR_SPACE, convertSrgbToBt709 } from "../lib/renderer/color.ts";

test("the export color space is explicit limited-range BT.709", () => {
  assert.deepEqual(BT709_COLOR_SPACE, {
    primaries: "bt709",
    transfer: "bt709",
    matrix: "bt709",
    fullRange: false,
  });
});

test("sRGB-encoded channels convert to the BT.709 transfer function", () => {
  const input = new Uint8ClampedArray([0, 255, 128, 255, 10, 200, 64, 32]);
  const output = convertSrgbToBt709(input);

  assert.equal(output.length, input.length);
  assert.equal(output[0], 0, "black stays black");
  assert.equal(output[1], 255, "white stays white");
  assert.equal(output[3], 255, "alpha is untouched");
  assert.equal(output[7], 32, "alpha is untouched on every pixel");
  assert.equal(output[4], 3, "a dark linear value stays near the low end");
  assert.equal(output[5], 194, "bright values track the BT.709 OETF");
  assert.equal(output[6], 48, "mid tones move to the BT.709 curve");
  assert.equal(convertSrgbToBt709(new Uint8ClampedArray([128, 128, 128, 255]))[0], 115);

  // The conversion is a pure function over the input.
  assert.deepEqual(Array.from(input), [0, 255, 128, 255, 10, 200, 64, 32]);
});
