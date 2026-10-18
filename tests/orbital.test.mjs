import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_MARKERS,
  MAX_RING_SEGMENTS,
  ORBITAL_BOUNDS,
  ORBITAL_DEFAULTS,
  drawOrbital,
  normalizeGraphicSettings,
  prepareOrbital,
} from "../lib/renderer/graphics.ts";
import { prepareScene } from "../lib/renderer/scene.ts";
import {
  isAnimatedTemplate,
  parseTemplate,
  templateV2Schema,
} from "../lib/renderer/template-schema.ts";
import { resolveRenderProfile } from "../lib/renderer/profile.ts";
import { ORBITAL_TEMPLATE, buildOrbitalTemplate } from "../lib/templates/orbital.ts";
import { FIRST_LIGHT_TEMPLATE } from "../lib/templates/first-light.ts";
import { TEMPLATE_PRESETS, ORBITAL_TEMPLATE_ID } from "../lib/templates/index.ts";

const COLORS = { base: "#0b0b12", ink: "#a49dc0", muted: "#4d4860", glow: "#e3dcff" };
const BOX = { x: 220, y: 220, width: 1480, height: 640 };

function recordingContext() {
  const commands = [];
  const push = (name) => (...args) => {
    commands.push([name, ...args]);
    if (name === "createRadialGradient") return { addColorStop: () => {} };
    if (name === "createPattern") return {};
    if (name === "measureText") return { width: String(args[0]).length * 20 };
    return undefined;
  };
  const ctx = {};
  for (const name of [
    "save", "restore", "beginPath", "rect", "clip", "fillRect", "strokeRect",
    "moveTo", "lineTo", "stroke", "arc", "ellipse", "fill", "drawImage",
    "fillText", "strokeText",
  ]) {
    ctx[name] = push(name);
  }
  ctx.measureText = (value) => ({ width: String(value).length * 20 });
  ctx.createRadialGradient = push("createRadialGradient");
  ctx.createPattern = push("createPattern");
  return { ctx, commands };
}

function drawFrame(prepared, frame) {
  const recorder = recordingContext();
  drawOrbital(recorder.ctx, prepared, BOX, frame);
  return recorder.commands;
}

const FRAME = {
  timeSeconds: 12.5,
  durationSeconds: 180,
  features: { rms: 0.4, low: 0.8, mid: 0.3, high: 0.6 },
};

test("the Orbital preset is a valid v2 scene with one in-bounds graphic", () => {
  assert.equal(ORBITAL_TEMPLATE.schemaVersion, 2);
  assert.equal(parseTemplate(structuredClone(ORBITAL_TEMPLATE)).name, "Orbital");
  assert.equal(ORBITAL_TEMPLATE.layers.filter((layer) => layer.type === "graphic").length, 1);
  assert.equal(templateV2Schema.safeParse(structuredClone(ORBITAL_TEMPLATE)).success, true);
  assert.equal(isAnimatedTemplate(ORBITAL_TEMPLATE), true);
  assert.equal(isAnimatedTemplate(FIRST_LIGHT_TEMPLATE), false);
});

test("every Orbital text box stays inside the frame and out of the graphic", () => {
  const graphic = ORBITAL_TEMPLATE.layers.find((layer) => layer.type === "graphic");
  for (const layer of ORBITAL_TEMPLATE.layers) {
    if (layer.type !== "text") continue;
    assert.ok(layer.maxHeight > 0, `${layer.value} needs a reserved height`);
    assert.ok(layer.y + layer.maxHeight <= 1080, `${layer.value} runs past the frame`);
    assert.ok(layer.x + layer.maxWidth <= 1920, `${layer.value} runs past the right edge`);
    const overlapsGraphic =
      layer.x < graphic.box.x + graphic.box.width &&
      layer.x + layer.maxWidth > graphic.box.x &&
      layer.y < graphic.box.y + graphic.box.height &&
      layer.y + layer.maxHeight > graphic.box.y;
    assert.equal(overlapsGraphic, false, `${layer.value} overlaps the graphic box`);
  }
});

test("v2 rejects unknown generators, out-of-range settings, and two graphics", () => {
  const base = structuredClone(ORBITAL_TEMPLATE);
  const graphic = base.layers.find((layer) => layer.type === "graphic");
  const clone = () => structuredClone(base);

  const bad = clone();
  bad.layers.find((layer) => layer.type === "graphic").generator = "plugin-orbital";
  assert.equal(templateV2Schema.safeParse(bad).success, false);

  for (const [key, value] of [
    ["ringCount", ORBITAL_BOUNDS.ringCount.max + 1],
    ["particleCount", ORBITAL_BOUNDS.particleCount.max + 1],
    ["tiltDeg", ORBITAL_BOUNDS.tiltDeg.max + 1],
    ["seed", -1],
  ]) {
    const doc = clone();
    doc.layers.find((layer) => layer.type === "graphic").settings[key] = value;
    assert.equal(templateV2Schema.safeParse(doc).success, false, `accepted ${key}=${value}`);
  }
  for (const [key, value] of [
    ["sensitivity", ORBITAL_BOUNDS.sensitivity.max + 0.1],
    ["rotationRpm", ORBITAL_BOUNDS.rotationRpm.max + 0.5],
    ["maxPulse", ORBITAL_BOUNDS.maxPulse.max + 0.01],
  ]) {
    const doc = clone();
    doc.layers.find((layer) => layer.type === "graphic").settings.motion[key] = value;
    assert.equal(templateV2Schema.safeParse(doc).success, false, `accepted ${key}=${value}`);
  }

  const outside = clone();
  outside.layers.find((layer) => layer.type === "graphic").box.x = 1200;
  assert.equal(templateV2Schema.safeParse(outside).success, false, "graphic box escaped the canvas");

  const two = clone();
  two.layers.push(structuredClone(graphic));
  assert.equal(templateV2Schema.safeParse(two).success, false, "two graphics were accepted");

  const unknownKey = clone();
  unknownKey.layers.find((layer) => layer.type === "graphic").texture = "remote.png";
  assert.equal(templateV2Schema.safeParse(unknownKey).success, false, "unknown keys were stripped");
});

test("settings clamp to the published bounds", () => {
  const normalized = normalizeGraphicSettings({
    seed: -5,
    ringCount: 99,
    particleCount: 99_999,
    tiltDeg: 1,
    motion: { enabled: true, sensitivity: 9, rotationRpm: -99, maxPulse: 1 },
  });
  assert.equal(normalized.seed, 0);
  assert.equal(normalized.ringCount, ORBITAL_BOUNDS.ringCount.max);
  assert.equal(normalized.particleCount, ORBITAL_BOUNDS.particleCount.max);
  assert.equal(normalized.tiltDeg, ORBITAL_BOUNDS.tiltDeg.min);
  assert.equal(normalized.motion.sensitivity, ORBITAL_BOUNDS.sensitivity.max);
  assert.equal(normalized.motion.rotationRpm, ORBITAL_BOUNDS.rotationRpm.min);
  assert.equal(normalized.motion.maxPulse, ORBITAL_BOUNDS.maxPulse.max);
});

test("the seeded graphic is deterministic and bounded", () => {
  const first = prepareOrbital(ORBITAL_DEFAULTS, COLORS);
  const second = prepareOrbital(ORBITAL_DEFAULTS, COLORS);
  assert.deepEqual(Array.from(first.particles), Array.from(second.particles));
  assert.deepEqual(first.rings, second.rings);
  assert.deepEqual(first.markers, second.markers);
  assert.notDeepEqual(
    Array.from(prepareOrbital({ ...ORBITAL_DEFAULTS, seed: 7 }, COLORS).particles),
    Array.from(first.particles),
    "a different seed must change the pattern",
  );

  const segments = first.rings.reduce((total, ring) => total + ring.segments.length, 0);
  assert.ok(segments <= MAX_RING_SEGMENTS, `${segments} ring segments`);
  assert.ok(first.markers.length <= MAX_MARKERS);
  assert.ok(first.particles.length <= ORBITAL_BOUNDS.particleCount.max * 2);
});

test("the same time and features draw identical commands; a seed changes them", () => {
  const prepared = prepareOrbital(ORBITAL_DEFAULTS, COLORS);
  assert.deepEqual(drawFrame(prepared, FRAME), drawFrame(prepared, FRAME));

  const otherTime = drawFrame(prepared, { ...FRAME, timeSeconds: FRAME.timeSeconds + 0.5 });
  assert.notDeepEqual(drawFrame(prepared, FRAME), otherTime, "time did not move the rings");

  const otherSeed = prepareOrbital({ ...ORBITAL_DEFAULTS, seed: 99 }, COLORS);
  assert.notDeepEqual(drawFrame(prepared, FRAME), drawFrame(otherSeed, FRAME));
});

test("disabling motion freezes rotation and energy response", () => {
  const frozen = prepareOrbital(
    { ...ORBITAL_DEFAULTS, motion: { ...ORBITAL_DEFAULTS.motion, enabled: false } },
    COLORS,
  );
  const quiet = drawFrame(frozen, { ...FRAME, timeSeconds: 0, features: { rms: 0, low: 0, mid: 0, high: 0 } });
  const loudLate = drawFrame(frozen, {
    ...FRAME,
    timeSeconds: 300,
    features: { rms: 1, low: 1, mid: 1, high: 1 },
  });
  assert.deepEqual(quiet, loudLate);
});

test("metadata and message layers appear only when their variables are set", () => {
  const { ctx } = recordingContext();
  const bare = prepareScene(ctx, ORBITAL_TEMPLATE, { track_name: "Midnight", producer_name: "Nova" });
  const bareText = bare.layers.filter((layer) => layer.type === "text").map((layer) => layer.text);
  assert.ok(bareText.includes("Midnight"));
  assert.ok(bareText.includes("NOVA"));
  assert.ok(!bareText.some((text) => text.includes("BPM")), "BPM drawn without a value");
  assert.ok(!bareText.some((text) => text.includes("KEY")), "KEY drawn without a value");
  assert.equal(bare.layers.filter((layer) => layer.type === "text").length, 2);

  const full = prepareScene(ctx, ORBITAL_TEMPLATE, {
    track_name: "Midnight",
    producer_name: "Nova",
    message_text: "Purchase This Track For Commercial Use",
    bpm: "128.5",
    key: "F# minor",
  });
  const fullText = full.layers.filter((layer) => layer.type === "text").map((layer) => layer.text);
  assert.ok(fullText.includes("BPM 128.5"));
  assert.ok(fullText.includes("KEY F# MINOR"));
  assert.ok(fullText.includes("Purchase This Track For Commercial Use"));
});

test("the image variant is explicit and does not mutate the source preset", () => {
  const before = JSON.stringify(ORBITAL_TEMPLATE);
  const withImage = buildOrbitalTemplate(
    { ...ORBITAL_DEFAULTS, seed: 11, ringCount: 4 },
    { withImage: true },
  );
  const without = buildOrbitalTemplate({ ...ORBITAL_DEFAULTS, seed: 11, ringCount: 4 });
  assert.equal(JSON.stringify(ORBITAL_TEMPLATE), before, "the source preset changed");
  assert.equal(withImage.layers.filter((layer) => layer.type === "image").length, 1);
  assert.equal(without.layers.filter((layer) => layer.type === "image").length, 0);
  const settings = withImage.layers.find((layer) => layer.type === "graphic").settings;
  assert.equal(settings.seed, 11);
  assert.equal(settings.ringCount, 4);
  assert.equal(withImage.name, "Orbital");
});

test("the animated profile is 30 fps with its own limit and a static still is rejected", () => {
  const animated = resolveRenderProfile(ORBITAL_TEMPLATE);
  assert.deepEqual(
    { animated: animated.animated, fps: animated.fps, maxSeconds: animated.maxSeconds },
    { animated: true, fps: 30, maxSeconds: 300 },
  );
  assert.throws(() => resolveRenderProfile(ORBITAL_TEMPLATE, 1), /render at 30 fps/);

  const still = resolveRenderProfile(FIRST_LIGHT_TEMPLATE);
  assert.equal(still.animated, false);
  assert.equal(still.fps, 1);
  assert.equal(still.maxSeconds, 900);
  assert.equal(resolveRenderProfile(FIRST_LIGHT_TEMPLATE, 24).fps, 24);
});

test("the picker keeps the original order and appends Orbital last", () => {
  assert.deepEqual(
    TEMPLATE_PRESETS.map((preset) => preset.id),
    ["first-light", "pulse", "grid", ORBITAL_TEMPLATE_ID],
  );
  assert.equal(TEMPLATE_PRESETS[0].id, "first-light");
  assert.equal(TEMPLATE_PRESETS[3].animated, true);
});
