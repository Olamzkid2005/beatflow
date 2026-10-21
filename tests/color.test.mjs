import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { BT709_COLOR_SPACE } from "../lib/renderer/color.ts";

test("the export color space is explicit limited-range BT.709", () => {
  assert.deepEqual(BT709_COLOR_SPACE, {
    primaries: "bt709",
    transfer: "bt709",
    matrix: "bt709",
    fullRange: false,
  });
});

test("the encoder hands canvas pixels to WebCodecs without a second transfer", () => {
  // A BT.709 LUT on top of the encoder's own RGB→YUV conversion double-applies
  // the transfer function and makes exports darker than the preview. The
  // encoder must pass `getImageData()` straight through.
  const source = readFileSync(new URL("../lib/renderer/encode.ts", import.meta.url), "utf8");
  assert.equal(source.includes("convertSrgbToBt709"), false);
  assert.equal(source.includes("colorSpace: BT709_COLOR_SPACE"), true);
  assert.equal(source.includes("new VideoSample(pixels"), true);

  const color = readFileSync(new URL("../lib/renderer/color.ts", import.meta.url), "utf8");
  assert.equal(color.includes("export function convertSrgbToBt709"), false);
});
