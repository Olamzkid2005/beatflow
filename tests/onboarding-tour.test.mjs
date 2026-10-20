import assert from "node:assert/strict";
import { test } from "node:test";

import {
  captureBaseline,
  practiceSatisfied,
  tagCount,
  hasFile,
  inputValue,
  measuredLayout,
  missingLayout,
  producerNameChanged,
} from "../lib/onboarding-tour.ts";

function docWith(rows) {
  return {
    querySelector(selector) {
      const entry = rows[selector];
      return typeof entry === "function" ? entry() : (entry ?? null);
    },
  };
}

function tagField(count) {
  return { parentElement: { querySelectorAll: () => Array.from({ length: count }, () => ({})) } };
}

test("a tooltip with room below sits under the control and points up", () => {
  const layout = measuredLayout(
    { left: 700, top: 180, width: 240, height: 44 },
    { width: 1280, height: 800 },
    1,
  );
  assert.equal(layout.tooltip.top, 244);
  assert.equal(layout.tooltip.left, 620);
  assert.equal(layout.tooltip.width, 400);
  assert.deepEqual(layout.pointer, { left: 200, direction: "up" });
  assert.equal(layout.step, 1);
});

test("a control near the bottom flips the tooltip above and points down", () => {
  const layout = measuredLayout(
    { left: 80, top: 700, width: 220, height: 40 },
    { width: 1280, height: 800 },
    9,
  );
  assert.equal(layout.tooltip.top, 350);
  assert.deepEqual(layout.pointer, { direction: "down", left: 174 });
});

test("placement clamps to both viewport edges on a narrow screen", () => {
  const leftEdge = measuredLayout(
    { left: 0, top: 140, width: 40, height: 40 },
    { width: 360, height: 740 },
    2,
  );
  assert.equal(leftEdge.tooltip.left, 16);
  assert.equal(leftEdge.tooltip.width, 328);
  assert.equal(leftEdge.pointer.left, 26);

  const rightEdge = measuredLayout(
    { left: 340, top: 140, width: 20, height: 40 },
    { width: 360, height: 740 },
    2,
  );
  assert.equal(rightEdge.tooltip.left, 16);
  assert.equal(rightEdge.pointer.left, 328 - 26);
});

test("a tall control on a wide screen moves the card beside it", () => {
  const placedLeft = measuredLayout(
    { left: 900, top: 150, width: 420, height: 520 },
    { width: 1440, height: 900 },
    1,
    430,
  );
  assert.equal(placedLeft.tooltip.left, 480);
  assert.equal(placedLeft.pointer.direction, "right");
  assert.equal(placedLeft.pointer.top, 215);

  const placedRight = measuredLayout(
    { left: 100, top: 150, width: 300, height: 520 },
    { width: 1440, height: 900 },
    1,
    430,
  );
  assert.equal(placedRight.tooltip.left, 420);
  assert.equal(placedRight.pointer.direction, "left");
  assert.equal(placedRight.pointer.top, 215);
});

 test("a measured card height decides placement more precisely than the estimate", () => {
  const short = measuredLayout(
    { left: 200, top: 500, width: 240, height: 40 },
    { width: 1280, height: 800 },
    3,
    200,
  );
  assert.equal(short.tooltip.top, 560);
  assert.equal(short.pointer.direction, "up");

  const tall = measuredLayout(
    { left: 200, top: 500, width: 240, height: 40 },
    { width: 1280, height: 800 },
    3,
    260,
  );
  assert.equal(tall.tooltip.top, 220);
  assert.equal(tall.pointer.direction, "down");
});

test("a missing target keeps the explanation but drops the spotlight", () => {
  const layout = missingLayout(4);
  assert.equal(layout.missing, true);
  assert.equal(layout.rect, null);
  assert.equal(layout.pointer, null);
  assert.equal(layout.step, 4);
});

test("reading a control returns the live value or an empty string", () => {
  assert.equal(inputValue(docWith({ "#a": { value: "hello" } }), "#a"), "hello");
  assert.equal(inputValue(docWith({}), "#a"), "");
  assert.equal(inputValue(docWith({ "#a": null }), "#a"), "");
});

test("file practice needs a real selection, not just a visible input", () => {
  assert.equal(hasFile(docWith({ "#audio": { files: { length: 1 } } }), "#audio"), true);
  assert.equal(hasFile(docWith({ "#audio": { files: null } }), "#audio"), false);
  assert.equal(hasFile(docWith({ "#audio": { files: { length: 0 } } }), "#audio"), false);
  assert.equal(hasFile(docWith({}), "#audio"), false);
});

test("tag practice counts rendered chips and requires an increase", () => {
  const prefilled = docWith({ "#tags": tagField(2) });
  assert.equal(tagCount(prefilled, "#tags"), 2);
  assert.equal(tagCount(docWith({}), "#tags"), 0);

  const probe = { watchTags: "#tags" };
  const baseline = captureBaseline(probe, prefilled);
  assert.deepEqual(baseline, { value: null, tags: 2 });
  assert.equal(practiceSatisfied(probe, baseline, prefilled), false);
  assert.equal(
    practiceSatisfied(probe, baseline, docWith({ "#tags": tagField(3) })),
    true,
  );
});

test("prefilled description and schedule need a real edit before counting", () => {
  const descriptionProbe = { watchValue: "#video-description" };
  const prefilled = docWith({ "#video-description": { value: "Produced by Nova" } });
  const descriptionBaseline = captureBaseline(descriptionProbe, prefilled);
  assert.equal(practiceSatisfied(descriptionProbe, descriptionBaseline, prefilled), false);
  assert.equal(
    practiceSatisfied(
      descriptionProbe,
      descriptionBaseline,
      docWith({ "#video-description": { value: "Produced by Nova\nMixed by Ada" } }),
    ),
    true,
  );
  assert.equal(
    practiceSatisfied(descriptionProbe, descriptionBaseline, docWith({ "#video-description": { value: "" } })),
    true,
  );

  const scheduleProbe = { watchValue: "#video-schedule" };
  const scheduleBaseline = captureBaseline(
    scheduleProbe,
    docWith({ "#video-schedule": { value: "2026-10-27T18:00" } }),
  );
  assert.equal(
    practiceSatisfied(
      scheduleProbe,
      scheduleBaseline,
      docWith({ "#video-schedule": { value: "2026-10-28T18:00" } }),
    ),
    true,
  );
  assert.equal(
    practiceSatisfied(
      scheduleProbe,
      scheduleBaseline,
      docWith({ "#video-schedule": { value: "2026-10-27T18:00" } }),
    ),
    false,
  );
});

test("producer-name practice ignores whitespace and the saved value", () => {
  assert.equal(
    producerNameChanged(docWith({ "#producer-name": { value: "  Nova  " } }), "Nova"),
    false,
  );
  assert.equal(
    producerNameChanged(docWith({ "#producer-name": { value: "Nova Beats" } }), "Nova"),
    true,
  );
  assert.equal(producerNameChanged(docWith({}), ""), false);
});
