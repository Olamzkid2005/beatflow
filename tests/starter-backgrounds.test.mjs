import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { readImageDimensions } from "../lib/renderer/assets.ts";
import {
  loadStarterBackground,
  STARTER_BACKGROUNDS,
} from "../lib/starter-backgrounds.ts";

test("starter backgrounds have unique ids, names, paths and descriptions", () => {
  const ids = new Set();
  const names = new Set();
  for (const starter of STARTER_BACKGROUNDS) {
    assert.ok(starter.id.length > 0);
    assert.ok(!ids.has(starter.id), `duplicate starter id ${starter.id}`);
    assert.ok(!names.has(starter.name), `duplicate starter name ${starter.name}`);
    ids.add(starter.id);
    names.add(starter.name);
    assert.ok(starter.src.startsWith("/images/"), `${starter.name} is not a bundled image`);
    assert.ok(starter.description.length > 0, `${starter.name} needs a description`);
  }
  assert.ok(STARTER_BACKGROUNDS.length >= 3);
});

test("every bundled starter is a real 1920×1080 JPEG", async () => {
  for (const starter of STARTER_BACKGROUNDS) {
    const bytes = await readFile(new URL(`../public${starter.src}`, import.meta.url));
    assert.ok(bytes.length > 10_000, `${starter.name} looks empty`);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    const file = new File([bytes], `${starter.id}.jpg`, { type: "image/jpeg" });
    assert.deepEqual(await readImageDimensions(file), { width: 1920, height: 1080 });
  }
});

test("loading a starter returns a File with a stable name and image type", async () => {
  const invited = [];
  const fetcher = async (url) => {
    invited.push(url);
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
  };
  const file = await loadStarterBackground(STARTER_BACKGROUNDS[0], fetcher);
  assert.ok(file instanceof File);
  assert.equal(file.name, `${STARTER_BACKGROUNDS[0].id}.jpg`);
  assert.equal(file.type, "image/jpeg");
  assert.equal(file.size, 7);
  assert.deepEqual(invited, [STARTER_BACKGROUNDS[0].src]);
});

test("a starter that cannot be fetched fails with a readable message", async () => {
  await assert.rejects(
    loadStarterBackground(STARTER_BACKGROUNDS[1], async () => new Response(null, { status: 404 })),
    /Could not load the Obsidian background \(404\)/,
  );
  await assert.rejects(
    loadStarterBackground(STARTER_BACKGROUNDS[2], async () => {
      throw new TypeError("offline");
    }),
    /Check your connection/,
  );
  await assert.rejects(
    loadStarterBackground(STARTER_BACKGROUNDS[2], async () =>
      new Response(new Uint8Array(0), { status: 200, headers: { "Content-Type": "image/jpeg" } }),
    ),
    /is empty/,
  );
});
