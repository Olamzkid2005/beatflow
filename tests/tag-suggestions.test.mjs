import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TAG_GROUPS,
  TAG_SUGGESTIONS,
  addTagToText,
  hasTag,
  mergeTag,
  parseTagText,
} from "../lib/tag-suggestions.ts";

test("comma text is trimmed, blanks dropped, and duplicates ignored by case", () => {
  assert.deepEqual(parseTagText(""), []);
  assert.deepEqual(parseTagText("  , ,"), []);
  assert.deepEqual(parseTagText(" afrobeats , instrumental,Afrobeats "), [
    "afrobeats",
    "instrumental",
  ]);
  assert.deepEqual(parseTagText("type beat"), ["type beat"]);
});

test("picking a suggestion appends it and normalises the separators", () => {
  assert.equal(addTagToText("", "afrobeats"), "afrobeats");
  assert.equal(addTagToText("afrobeats", "instrumental"), "afrobeats, instrumental");
  assert.equal(addTagToText("afrobeats,instrumental,", "type beat"), "afrobeats, instrumental, type beat");
});

test("picking a tag that is already present changes nothing", () => {
  assert.equal(addTagToText("afrobeats, Instrumental", "instrumental"), "afrobeats, Instrumental");
  assert.deepEqual(mergeTag(["afrobeats"], "AFROBEATS"), ["afrobeats"]);
});

test("mergeTag returns a new array and never mutates the caller's tags", () => {
  const current = ["beat"];
  const next = mergeTag(current, "trap");
  assert.deepEqual(next, ["beat", "trap"]);
  assert.deepEqual(current, ["beat"]);
  assert.notEqual(next, current);
});

test("hasTag compares case-insensitively and ignores padding", () => {
  assert.equal(hasTag(["Afrobeats"], "afrobeats"), true);
  assert.equal(hasTag(["afrobeats"], " trap "), false);
});

test("every suggestion is unique, short, and free of characters YouTube rejects", () => {
  const seen = new Set();
  for (const tag of TAG_SUGGESTIONS) {
    const key = tag.toLowerCase();
    assert.equal(seen.has(key), false, `duplicate suggestion: ${tag}`);
    seen.add(key);
    assert.ok(tag.length > 0 && tag.length <= 30, `suggestion length: ${tag}`);
    assert.doesNotMatch(tag, /[<>]/);
  }
  assert.equal(
    TAG_GROUPS.reduce((total, group) => total + group.tags.length, 0),
    TAG_SUGGESTIONS.length,
  );
  for (const group of TAG_GROUPS) {
    assert.ok(group.label.trim().length > 0);
    assert.ok(group.tags.length > 0);
  }
});
