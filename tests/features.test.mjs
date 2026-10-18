import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ATTACK_SECONDS,
  FEATURE_ALGORITHM_VERSION,
  FeatureAnalyzer,
  HOP_RATE,
  HOP_SAMPLES,
  RELEASE_SECONDS,
  analyzeFeatureChannels,
  sampleFeatures,
} from "../lib/renderer/audio-features.ts";

const RATE = 48_000;

function tone(frequency, seconds, amplitude = 0.5, phase = 0) {
  const length = Math.round(seconds * RATE);
  const data = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    data[index] = Math.sin((index / RATE) * frequency * Math.PI * 2 + phase) * amplitude;
  }
  return data;
}

function silent(seconds) {
  return new Float32Array(Math.round(seconds * RATE));
}

function analyze(left, right = left) {
  return analyzeFeatureChannels(left, right, left.length / RATE);
}

function average(array, from = 1, to = array.length) {
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += array[index];
  return sum / Math.max(1, to - from);
}

test("the feature table is versioned and timed at a 60 Hz hop rate", () => {
  const table = analyze(tone(440, 1));
  assert.equal(table.version, FEATURE_ALGORITHM_VERSION);
  assert.equal(table.sampleRate, RATE);
  assert.equal(table.hopSamples, HOP_SAMPLES);
  assert.equal(table.hopRate, HOP_RATE);
  assert.equal(table.hopRate, 60);
  assert.equal(table.duration, 1);
  assert.equal(table.rms.length, 61, "one zero sample plus 60 hops");
  assert.equal(table.low.length, 61);
  assert.equal(table.mid.length, 61);
  assert.equal(table.high.length, 61);
  assert.ok(table.rms instanceof Float32Array);
});

test("silence stays at zero and the zero sample is explicit", () => {
  const table = analyze(silent(2));
  for (const array of [table.rms, table.low, table.mid, table.high]) {
    assert.equal(array[0], 0);
    assert.ok(Array.from(array).every((value) => value === 0));
  }
});

test("a quiet track never drives a full pulse", () => {
  const table = analyze(tone(440, 1, 0.001));
  assert.ok(average(table.rms) < 0.05, `quiet track averaged ${average(table.rms)}`);
  assert.ok(sampleFeatures(table, 0.5).rms < 0.1);
});

test("low, middle and high tones activate their own band most", () => {
  const low = analyze(tone(60, 1, 0.6));
  const mid = analyze(tone(600, 1, 0.6));
  const high = analyze(tone(6000, 1, 0.6));

  assert.ok(average(low.low) > average(low.mid), "60 Hz should favour the low band");
  assert.ok(average(low.low) > average(low.high), "60 Hz should beat the high band");
  assert.ok(average(mid.mid) > average(mid.low), "600 Hz should favour the middle band");
  assert.ok(average(high.high) > average(high.mid), "6 kHz should favour the high band");
  assert.ok(average(high.high) > average(high.low), "6 kHz should beat the low band");
  assert.ok(average(low.rms) > 0.5, "a loud tone should be well above the floor");
});

test("opposite-phase stereo is not cancelled by the analysis", () => {
  const phase = tone(220, 1, 0.4);
  const anti = new Float32Array(phase.length);
  for (let index = 0; index < phase.length; index += 1) anti[index] = -phase[index];

  const normal = analyze(phase);
  const opposed = analyze(phase, anti);
  for (const key of ["rms", "low", "mid", "high"]) {
    assert.ok(
      Math.abs(average(normal[key]) - average(opposed[key])) < 0.01,
      `${key} differs between in-phase and anti-phase stereo`,
    );
  }
});

test("clipping maps to the top of the range, not beyond it", () => {
  const loud = analyze(tone(440, 1, 2));
  for (const array of [loud.rms, loud.low, loud.mid, loud.high]) {
    assert.ok(Array.from(array).every((value) => value >= 0 && value <= 1));
  }
  assert.ok(Math.max(...loud.rms) > 0.95);
});

test("a transient attacks quickly and releases more slowly", () => {
  const signal = new Float32Array(RATE * 2);
  // One loud hop (800 samples), then silence.
  for (let index = 0; index < 800; index += 1) {
    signal[index] = Math.sin((index / RATE) * 440 * Math.PI * 2);
  }
  const table = analyze(signal);
  const afterBurst = table.rms[2];
  const oneHopLater = table.rms[3];
  const muchLater = table.rms[60];

  assert.ok(afterBurst > 0.2, `expected a visible attack, got ${afterBurst}`);
  assert.ok(oneHopLater < afterBurst, "release should fall after the burst");
  assert.ok(oneHopLater > 0, "release should not drop instantly");
  assert.ok(muchLater < 0.05, `release should approach silence, got ${muchLater}`);
  // A 60 Hz hop lasts 16.7 ms, longer than the 10 ms attack constant, so a
  // full hop reaches most of its target.
  assert.ok(
    table.rms[2] > 0.5 * table.rms[2] + 0.1,
    `attack constant ${ATTACK_SECONDS}s should not leave the first hop near zero`,
  );
  assert.ok(RELEASE_SECONDS > ATTACK_SECONDS);
});

test("chunked analysis is identical to one large push", () => {
  const left = tone(220, 1.3, 0.4);
  const right = tone(660, 1.3, 0.25);
  const whole = analyzeFeatureChannels(left, right, left.length / RATE);

  const analyzer = new FeatureAnalyzer();
  let offset = 0;
  while (offset < left.length) {
    const end = Math.min(offset + 1234, left.length);
    analyzer.push(left.subarray(offset, end), right.subarray(offset, end));
    offset = end;
  }
  const chunked = analyzer.finish(left.length / RATE);

  for (const key of ["rms", "low", "mid", "high"]) {
    assert.deepEqual(Array.from(chunked[key]), Array.from(whole[key]), `${key} array differs`);
  }
  assert.equal(chunked.duration, whole.duration);
});

test("the final partial hop is stored exactly at the audio duration", () => {
  const samples = Math.round(1.05 * RATE); // 50,400 samples: a partial 800-sample hop
  const signal = new Float32Array(samples).fill(0.2);
  const table = analyze(signal);
  assert.equal(table.duration, 1.05);
  assert.equal(table.rms.length, 63 + 1);
  const lastTime = Math.min((table.rms.length - 1) / table.hopRate, table.duration);
  assert.equal(lastTime, 1.05);
  const atEnd = sampleFeatures(table, table.duration);
  assert.equal(atEnd.rms, table.rms[table.rms.length - 1]);
  // Beyond the end clamps to the final sample instead of inventing energy.
  assert.deepEqual(sampleFeatures(table, 99), atEnd);
});

test("sampling interpolates between hops and clamps at both ends", () => {
  const table = analyze(tone(440, 1));
  const first = sampleFeatures(table, -5);
  assert.deepEqual(first, { rms: 0, low: 0, mid: 0, high: 0 });

  const atHop1 = sampleFeatures(table, 1 / table.hopRate);
  assert.equal(atHop1.rms, table.rms[1]);
  assert.equal(atHop1.low, table.low[1]);

  const middle = sampleFeatures(table, 1.5 / table.hopRate);
  assert.ok(
    Math.abs(middle.rms - (table.rms[1] + table.rms[2]) / 2) < 1e-6,
    "halfway between two hops should interpolate linearly",
  );

  const end = sampleFeatures(table, table.duration + 10);
  assert.equal(end.rms, table.rms[table.rms.length - 1]);
});

test("analysis rejects a nonpositive or nonfinite duration", () => {
  const analyzer = new FeatureAnalyzer();
  for (const duration of [0, -1, NaN, Infinity]) {
    assert.throws(() => analyzer.finish(duration), RangeError);
  }
  assert.throws(() => analyzer.push(new Float32Array(2), new Float32Array(3)), /equal channel lengths/);
});
