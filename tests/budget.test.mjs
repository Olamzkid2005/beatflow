import assert from "node:assert/strict";
import { test } from "node:test";

import { assertAudioBudget, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "../lib/renderer/audio.ts";
import { assertImageBudget, MAX_IMAGE_PIXELS, readImageDimensions } from "../lib/renderer/assets.ts";

test("images over the decoded pixel budget reject before decoding", () => {
  assert.doesNotThrow(() => assertImageBudget(1920, 1080));
  assert.doesNotThrow(() => assertImageBudget(8000, 4000));
  assert.throws(() => assertImageBudget(8000, 5000), /too large/i);
  assert.throws(() => assertImageBudget(0, 100), /invalid dimensions/i);
  assert.throws(() => assertImageBudget(Number.NaN, 100), /invalid dimensions/i);
  assert.equal(MAX_IMAGE_PIXELS, 32_000_000);
});

test("image dimensions come from headers without a pixel decode", async () => {
  const be = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const png = new File(
    [
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
        ...be(8000), ...be(5000),
      ]),
    ],
    "huge.png",
    { type: "image/png" },
  );
  assert.deepEqual(await readImageDimensions(png), { width: 8000, height: 5000 });

  const jpeg = new File(
    [
      new Uint8Array([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
        0x0b, 0xb8, 0x0f, 0xa0,
        0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      ]),
    ],
    "photo.jpg",
    { type: "image/jpeg" },
  );
  assert.deepEqual(await readImageDimensions(jpeg), { width: 4000, height: 3000 });

  const webp = new File(
    [
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x58, 0x0a, 0, 0, 0,
        0, 0, 0, 0, 0x7f, 0x07, 0x00, 0x37, 0x04, 0x00,
      ]),
    ],
    "wide.webp",
    { type: "image/webp" },
  );
  // 1920x1080 canvas: the stored fields are width-1 and height-1.
  assert.deepEqual(await readImageDimensions(webp), { width: 1920, height: 1080 });

  const unknown = new File([new Uint8Array([1, 2, 3, 4, 5])], "blob.bin", { type: "application/octet-stream" });
  assert.equal(await readImageDimensions(unknown), null);
});

test("audio is capped before and after metadata probing", () => {
  assert.doesNotThrow(() => assertAudioBudget(10_000, null));
  assert.doesNotThrow(() => assertAudioBudget(10_000, 60));
  assert.throws(() => assertAudioBudget(0, null), /empty/i);
  assert.throws(() => assertAudioBudget(MAX_AUDIO_BYTES + 1, null), /larger than/i);
  assert.throws(() => assertAudioBudget(10_000, MAX_AUDIO_SECONDS + 1), /longer than/i);
});
