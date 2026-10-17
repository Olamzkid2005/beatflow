import assert from "node:assert/strict";
import { test } from "node:test";

import { FIRST_LIGHT_TEMPLATE } from "../lib/templates/first-light.ts";
import { layoutText, MAX_TEXT_LINES } from "../lib/renderer/scene.ts";
import {
  interpolateTemplateValue,
  parseTemplate,
  templateSchema,
} from "../lib/renderer/template-schema.ts";

/** Deterministic stand-in for canvas measureText: 0.55 em per character. */
function measure(text, font) {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return text.length * size * 0.55;
}

test("first-light preset validates against schema v1", () => {
  assert.equal(FIRST_LIGHT_TEMPLATE.schemaVersion, 1);
  assert.equal(FIRST_LIGHT_TEMPLATE.name, "First Light");
  assert.ok(FIRST_LIGHT_TEMPLATE.layers.length > 0);
  assert.equal(parseTemplate(FIRST_LIGHT_TEMPLATE).layers.length, FIRST_LIGHT_TEMPLATE.layers.length);
});

test("schema rejects unknown bindings, versions, colors, and too many layers", () => {
  const base = structuredClone(FIRST_LIGHT_TEMPLATE);
  assert.equal(templateSchema.safeParse({ ...base, schemaVersion: 2 }).success, false);
  assert.equal(
    templateSchema.safeParse({ ...base, layers: [{ type: "image", binding: "remote_url" }] }).success,
    false,
  );
  assert.equal(
    templateSchema.safeParse({ ...base, canvas: { ...base.canvas, backgroundColor: "red" } }).success,
    false,
  );
  assert.equal(
    templateSchema.safeParse({
      ...base,
      layers: Array.from({ length: 31 }, () => base.layers[0]),
    }).success,
    false,
  );
});

test("interpolation fills known variables and never invents unknown ones", () => {
  assert.equal(
    interpolateTemplateValue("{{track_name}} — {{producer_name}}", {
      track_name: "Midnight",
      producer_name: "Nova",
    }),
    "Midnight — Nova",
  );
  assert.equal(interpolateTemplateValue("{{bpm}}/{{ unknown }}", {}), "/");
});

test("a long title shrinks to fit three lines", () => {
  const layout = layoutText({
    text: "Midnight Loop (Extended Visualizer Version With A Very Long Name That Keeps Going)",
    fontSize: 104,
    minFontSize: 40,
    maxWidth: 1200,
    weight: 700,
    family: "Inter",
    measure,
  });
  assert.ok(layout.fontSize < 104, "font should shrink");
  assert.ok(layout.fontSize >= 40, "font should not shrink past the floor");
  assert.ok(layout.lines.length <= MAX_TEXT_LINES);
  for (const line of layout.lines) {
    assert.ok(measure(line, `700 ${layout.fontSize}px Inter`) <= 1200, `line too wide: ${line}`);
  }
});

test("a short title keeps the requested size on one line", () => {
  const layout = layoutText({
    text: "Midnight",
    fontSize: 104,
    minFontSize: 40,
    maxWidth: 1200,
    weight: 700,
    family: "Inter",
    measure,
  });
  assert.equal(layout.fontSize, 104);
  assert.deepEqual(layout.lines, ["Midnight"]);
});

test("an unbreakable long word truncates with an ellipsis at the floor", () => {
  const layout = layoutText({
    text: "Supercalifragilisticexpialidocious",
    fontSize: 104,
    minFontSize: 40,
    maxWidth: 400,
    weight: 700,
    family: "Inter",
    measure,
  });
  assert.equal(layout.fontSize, 40);
  assert.ok(layout.lines[0].endsWith("…"));
  assert.ok(measure(layout.lines[0], "700 40px Inter") <= 400);
});
