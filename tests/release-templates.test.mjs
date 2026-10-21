import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DESCRIPTION_TEMPLATES,
  DESCRIPTION_TOKEN_HELP,
  fillDescriptionTokens,
} from "../lib/release-templates.ts";
import { MAX_DESCRIPTION_BYTES } from "../lib/youtube/metadata.ts";

const template = DESCRIPTION_TEMPLATES[0];

test("the type-beat template covers the release sections the channel uses", () => {
  assert.equal(DESCRIPTION_TEMPLATES.length >= 1, true);
  assert.equal(template.id, "type-beat-license");
  for (const needle of [
    "{{track_name}}",
    "{{key}}",
    "{{bpm}}",
    "{{producer_name}}",
    "license",
    "CONTACT",
    "#typebeat",
    "Tags (Ignore)",
  ]) {
    assert.equal(template.body.includes(needle), true, `template is missing ${needle}`);
  }
  assert.ok(
    new TextEncoder().encode(template.body).length < MAX_DESCRIPTION_BYTES,
    "the template must fit YouTube's description limit",
  );
});

test("every supported token is replaced, with no placeholder left behind", () => {
  const filled = fillDescriptionTokens(template.body, {
    year: "2027",
    track_name: "Midnight Loop",
    producer_name: "GlitchB3atz",
    key: "C min",
    bpm: "128",
  });
  assert.equal(filled.includes("{{"), false);
  assert.match(filled, /^\[FREE\] 2027 Afrobeat Type Beat — Midnight Loop \(C min · 128 BPM\)/);
  assert.match(filled, /produced by GlitchB3atz\./);
});

test("missing values stay visible as bracketed instructions", () => {
  const filled = fillDescriptionTokens(template.body, { track_name: "" });
  assert.match(filled, /\(\[KEY\] · \[BPM\] BPM\)/);
  assert.match(filled, /produced by \[PRODUCER NAME\]\./);
});

test("the year defaults to this year and the fill is idempotent", () => {
  const once = fillDescriptionTokens("{{year}}", {});
  assert.equal(once, String(new Date().getFullYear()));
  assert.equal(fillDescriptionTokens(once, {}), once);
  assert.equal(fillDescriptionTokens(template.body, { bpm: "90" }).includes("{{bpm}}"), false);
});

test("unknown tokens and plain text are never rewritten", () => {
  assert.equal(fillDescriptionTokens("{{track_name}} / {{album}}", { track_name: "A" }), "A / {{album}}");
  assert.equal(fillDescriptionTokens("", { track_name: "A" }), "");
});

test("the hint list names every token the template uses", () => {
  const used = new Set(
    [...template.body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((match) => match[1]),
  );
  const documented = new Set(DESCRIPTION_TOKEN_HELP.map((entry) => entry.token.replace(/[{}]/g, "")));
  assert.deepEqual([...used].sort(), [...documented].sort());
});
