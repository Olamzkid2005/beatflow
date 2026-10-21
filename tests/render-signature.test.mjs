import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fileIdentity,
  isRenderStale,
  renderSignature,
} from "../lib/render-signature.ts";

const audio = { name: "beat.mp3", size: 1024, lastModified: 111 };
const image = { name: "cover.jpg", size: 2048, lastModified: 222 };

const base = {
  templateId: "orbital",
  appearance: '{"ringCount":3}',
  producerName: "Nova",
  trackName: "Midnight Loop",
  message: "Purchase for commercial use",
  bpm: "128",
  key: "C min",
  audio,
  image,
  outputProfile: "animated",
};

test("equal inputs always produce the same signature", () => {
  assert.equal(renderSignature(base), renderSignature({ ...base }));
  // Same values, different object insertion order.
  const reordered = { outputProfile: "animated", image, audio, key: "C min", bpm: "128", ...base };
  assert.equal(renderSignature(reordered), renderSignature(base));
});

test("every input that changes the video changes the signature", () => {
  const variants = {
    templateId: { templateId: "first-light" },
    appearance: { appearance: '{"ringCount":4}' },
    producerName: { producerName: "Other" },
    trackName: { trackName: "Midnight Loop 2" },
    message: { message: "" },
    bpm: { bpm: null },
    key: { key: null },
    outputProfile: { outputProfile: "static" },
    audio: { audio: { ...audio, lastModified: 999 } },
    image: { image: null },
  };
  const seen = new Set([renderSignature(base)]);
  for (const [field, patch] of Object.entries(variants)) {
    const signature = renderSignature({ ...base, ...patch });
    assert.equal(seen.has(signature), false, `${field} did not change the signature`);
    seen.add(signature);
  }
});

test("an empty bpm and an unset bpm are the same render", () => {
  assert.equal(
    renderSignature({ ...base, bpm: null }),
    renderSignature({ ...base, bpm: "" }),
  );
  assert.equal(
    renderSignature({ ...base, key: null }),
    renderSignature({ ...base, key: "" }),
  );
});

test("file identity ignores unrelated fields and keeps the three that matter", () => {
  assert.equal(fileIdentity(null), null);
  assert.deepEqual(fileIdentity({ ...audio, path: "/tmp/beat.mp3" }), audio);
});

test("only a known, different signature counts as stale", () => {
  const current = renderSignature(base);
  assert.equal(isRenderStale(null, current), false, "no render yet");
  assert.equal(isRenderStale(current, current), false);
  assert.equal(isRenderStale(current, renderSignature({ ...base, bpm: "140" })), true);
});
