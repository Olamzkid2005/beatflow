import assert from "node:assert/strict";
import { test } from "node:test";

import { FIRST_LIGHT_TEMPLATE } from "../lib/templates/first-light.ts";
import { DEFAULT_TEMPLATE_ID, TEMPLATE_PRESETS } from "../lib/templates/index.ts";
import { layoutText, MAX_TEXT_LINES } from "../lib/renderer/scene.ts";
import {
  interpolateTemplateValue,
  parseTemplate,
  templateSchema,
} from "../lib/renderer/template-schema.ts";
import {
  assertExportCanvas,
  normalizeFps,
  snapshotRenderInput,
} from "../lib/renderer/validate.ts";

/** Deterministic stand-in for canvas measureText: 0.55 em per character. */
function measure(text, font) {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return text.length * size * 0.55;
}

/** Same width rule the scene uses, including letter spacing. */
function textWidth(text, font, letterSpacing = 0) {
  return measure(text, font) + (text.length > 0 ? letterSpacing * (text.length - 1) : 0);
}

const KNOWN_VARIABLES = new Set([
  "track_name",
  "filename",
  "producer_name",
  "bpm",
  "key",
  "year",
  "purchase_url",
]);

function textLayers(template) {
  return template.layers.filter((layer) => layer.type === "text");
}

test("every preset parses, is named uniquely, and binds only known variables", () => {
  const names = new Set();
  for (const preset of TEMPLATE_PRESETS) {
    assert.equal(parseTemplate(preset.template).name, preset.template.name);
    assert.ok(!names.has(preset.template.name), `duplicate preset name ${preset.template.name}`);
    names.add(preset.template.name);
    assert.ok(preset.description.length > 0, `${preset.template.name} needs a description`);
    assert.ok(
      textLayers(preset.template).some((layer) => layer.value.includes("{{track_name}}")),
      `${preset.template.name} must show the track name`,
    );
    for (const layer of textLayers(preset.template)) {
      for (const [, name] of layer.value.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
        assert.ok(KNOWN_VARIABLES.has(name), `${preset.template.name} uses unknown {{${name}}}`);
      }
    }
  }
  assert.equal(TEMPLATE_PRESETS[0].id, DEFAULT_TEMPLATE_ID);
});

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

test("a very long title fits every preset's title layer width and height", () => {
  const title =
    "Midnight Loop (Extended Visualizer Version Featuring A Guest Verse And A Very Long Name That Keeps Going)";
  for (const preset of TEMPLATE_PRESETS) {
    const titles = textLayers(preset.template).filter((layer) => layer.value.includes("{{track_name}}"));
    assert.ok(titles.length > 0, `${preset.template.name} has no title layer`);
    for (const layer of titles) {
      const family = layer.fontFamily;
      const layout = layoutText({
        text: title,
        fontSize: layer.fontSize,
        minFontSize: layer.minFontSize,
        maxWidth: layer.maxWidth,
        weight: layer.fontWeight,
        family,
        letterSpacing: layer.letterSpacing,
        maxHeight: layer.maxHeight,
        lineHeight: layer.lineHeight,
        measure,
      });
      assert.ok(layout.lines.length <= MAX_TEXT_LINES, preset.template.name);
      assert.ok(layout.fontSize >= layer.minFontSize, preset.template.name);
      assert.ok(
        layer.maxHeight === undefined || layout.lines.length * layout.lineHeight <= layer.maxHeight,
        `${preset.template.name}: ${layout.lines.length} lines exceed ${layer.maxHeight}px`,
      );
      for (const line of layout.lines) {
        const width = textWidth(line, `${layer.fontWeight} ${layout.fontSize}px ${family}`, layer.letterSpacing);
        assert.ok(width <= layer.maxWidth, `${preset.template.name}: "${line}" is ${width}px wide`);
      }
    }
  }
});

test("every text layer reserves vertical space so it cannot clip or collide", () => {
  for (const preset of TEMPLATE_PRESETS) {
    for (const layer of textLayers(preset.template)) {
      if (!layer.value.includes("{{track_name}}") && !layer.value.includes("{{producer_name}}")) {
        continue;
      }
      assert.ok(
        layer.maxHeight !== undefined && layer.maxHeight > 0,
        `${preset.template.name} text layer at y=${layer.y} needs maxHeight`,
      );
      assert.ok(
        layer.y + layer.maxHeight <= preset.template.canvas.height,
        `${preset.template.name} reserves space past the frame`,
      );
    }
    const titles = textLayers(preset.template).filter((layer) => layer.value.includes("{{track_name}}"));
    const brands = textLayers(preset.template).filter((layer) => layer.value.includes("{{producer_name}}"));
    for (const title of titles) {
      for (const brand of brands) {
        assert.ok(
          title.y + title.maxHeight <= brand.y || brand.y + brand.maxHeight <= title.y,
          `${preset.template.name}: title and branding boxes overlap`,
        );
      }
    }
  }
});

test("a text box too short for one line fails instead of drawing outside it", () => {
  assert.throws(
    () =>
      layoutText({
        text: "Midnight",
        fontSize: 100,
        minFontSize: 40,
        maxWidth: 1200,
        weight: 700,
        family: "Inter",
        maxHeight: 30,
        measure,
      }),
    /at least 44px/,
  );
});

test("FPS is validated before any render work", () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity, "30", null, undefined, 0.5, 61]) {
    assert.throws(() => normalizeFps(value), RangeError, `accepted ${String(value)}`);
  }
  assert.equal(normalizeFps(1), 1);
  assert.equal(normalizeFps(30), 30);
  assert.equal(normalizeFps(60), 60);
});

test("the export boundary rejects odd or invalid dimensions", () => {
  assert.doesNotThrow(() => assertExportCanvas({ width: 1920, height: 1080 }));
  for (const canvas of [
    { width: 1919, height: 1080 },
    { width: 1920, height: 1079 },
    { width: 0, height: 1080 },
    { width: 1920.5, height: 1080 },
    { width: 4098, height: 1080 },
  ]) {
    assert.throws(() => assertExportCanvas(canvas), RangeError, `accepted ${JSON.stringify(canvas)}`);
  }
});

test("the render snapshot detaches templates and variables", () => {
  const template = structuredClone(FIRST_LIGHT_TEMPLATE);
  const vars = { track_name: "Original", producer_name: "Nova" };
  const snapshot = snapshotRenderInput({ template, vars });

  template.layers.find((layer) => layer.type === "text").value = "Mutated";
  vars.track_name = "Mutated";
  snapshot.vars.producer_name = "Changed only in the snapshot";

  assert.equal(
    snapshot.template.layers.find((layer) => layer.type === "text").value,
    "{{track_name}}",
  );
  assert.equal(snapshot.vars.track_name, "Original");
  assert.equal(vars.producer_name, "Nova");
  assert.equal(
    snapshot.template.layers.find((layer) => layer.type === "text" && layer.value.includes("track_name")).value,
    "{{track_name}}",
  );
});

test("unknown render input fields are rejected rather than stripped", () => {
  const base = structuredClone(FIRST_LIGHT_TEMPLATE);
  assert.equal(templateSchema.safeParse({ ...base, unexpected: true }).success, false);
  assert.equal(
    templateSchema.safeParse({
      ...base,
      layers: [{ ...base.layers[3], surprise: 1 }],
    }).success,
    false,
  );
});
