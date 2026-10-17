import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { assertProbeResults, inspectMp4 } from "../tools/m0-probe/mp4.mjs";
const historical = JSON.parse(await readFile(new URL("../tools/m0-probe/report.json", import.meta.url), "utf8"));

test("accepts the measured media proof without requiring exploratory Quality variants", () => {
  assert.doesNotThrow(() => assertProbeResults(historical.probe, historical.mp4));
});

test("fails required codec/render/playback steps and missing MP4 inspection", () => {
  for (const name of ["environment", "webcodecsVideo", "webcodecsAudio", "mediabunnyCapabilities", "renderMp4", "readBack", "chromePlayback"]) {
    const copy = structuredClone(historical);
    copy.probe.steps[name].ok = false;
    assert.throws(() => assertProbeResults(copy.probe, copy.mp4), new RegExp(name));
  }
  assert.throws(() => assertProbeResults(historical.probe, null), /MP4/);
});

test("fails structural, duration, format, decode and playback regressions", () => {
  for (const mutate of [
    (x) => { x.mp4.moovBeforeMdat = false; },
    (x) => { x.mp4.hasElst = true; },
    (x) => { x.mp4.tracks[0].codedWidth = 1280; },
    (x) => { x.mp4.tracks[1].sampleRate = 44100; },
    (x) => { x.probe.steps.readBack.decodedFrames = 0; },
    (x) => { x.probe.steps.readBack.duration = 7; },
    (x) => { x.probe.steps.chromePlayback.playedTo = 0; },
    (x) => { x.probe.steps.renderMp4.saved = false; },
  ]) {
    const copy = structuredClone(historical);
    mutate(copy);
    assert.throws(() => assertProbeResults(copy.probe, copy.mp4));
  }
});

test("bundled artifact still matches the historical structural report", async () => {
  const mp4 = inspectMp4(await readFile(new URL("../public/beatflow-m0-test-5s.mp4", import.meta.url)));
  assert.deepEqual(mp4, historical.mp4);
});
