/**
 * Deterministic track analysis for the audio-reactive profile (design section
 * 12.4). Pure numeric code with no DOM or Web Audio imports so the same
 * implementation runs in a Worker, on the main thread as a fallback, and in
 * Node tests.
 *
 * The four features are full-band RMS and the RMS of three fixed, broad
 * biquad bands. They are display energy, not pitch or tempo detection. Every
 * coefficient, hop size and time constant below is part of the algorithm
 * version: changing one requires bumping `FEATURE_ALGORITHM_VERSION`, because
 * saved seeds are expected to keep their meaning.
 */

export const FEATURE_ALGORITHM_VERSION = 1 as const;
export const ANALYSIS_SAMPLE_RATE = 48_000;
/** 800 samples at 48 kHz is a 60 Hz feature rate. */
export const HOP_SAMPLES = 800;
export const HOP_RATE = ANALYSIS_SAMPLE_RATE / HOP_SAMPLES;
/** RMS at or below this level maps to zero, so silence never pulses. */
export const FEATURE_FLOOR_DB = -60;
export const ATTACK_SECONDS = 0.01;
export const RELEASE_SECONDS = 0.16;

export type FeatureSample = {
  /** Full-band RMS, 0–1. */
  rms: number;
  /** 40–180 Hz band, 0–1. */
  low: number;
  /** 180–2000 Hz band, 0–1. */
  mid: number;
  /** 2000–12000 Hz band, 0–1. */
  high: number;
};

export type AudioFeatureTable = {
  version: typeof FEATURE_ALGORITHM_VERSION;
  sampleRate: number;
  hopSamples: number;
  hopRate: number;
  duration: number;
  /**
   * Index 0 is a zero sample at t=0; every later index is a hop end time.
   * Timestamps are implicit (`min(index / hopRate, duration)`), with the final
   * partial hop stored exactly at the audio duration.
   */
  rms: Float32Array;
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
};

export type FeatureBands = {
  low: number;
  mid: number;
  high: number;
};

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/**
 * RBJ band-pass (constant 0 dB peak gain) normalised for a transposed
 * direct-form II filter. The bands are deliberately wide; they are broad
 * energy regions with rolloff, not brick-wall bins.
 */
function bandPass(centerHz: number, q: number, sampleRate = ANALYSIS_SAMPLE_RATE): Biquad {
  const w0 = (2 * Math.PI * centerHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** Fixed, versioned bands: 40–180, 180–2000, 2000–12000 Hz. */
export const FEATURE_BANDS = {
  low: bandPass(Math.sqrt(40 * 180), Math.sqrt(40 * 180) / (180 - 40)),
  mid: bandPass(Math.sqrt(180 * 2000), Math.sqrt(180 * 2000) / (2000 - 180)),
  high: bandPass(Math.sqrt(2000 * 12000), Math.sqrt(2000 * 12000) / (12000 - 2000)),
} as const;

type BiquadState = { s1: number; s2: number };

function stepBiquad(filter: Biquad, state: BiquadState, input: number): number {
  const output = filter.b0 * input + state.s1;
  state.s1 = filter.b1 * input - filter.a1 * output + state.s2;
  state.s2 = filter.b2 * input - filter.a2 * output;
  return output;
}

/** Maps mean-square power to 0–1 over the fixed -60…0 dBFS window. */
export function powerToFeature(power: number): number {
  if (!Number.isFinite(power) || power <= 0) return 0;
  const db = 10 * Math.log10(power);
  return clamp01((db - FEATURE_FLOOR_DB) / -FEATURE_FLOOR_DB);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Causal attack/release smoothing. The first sample starts from zero, so a
 * silent lead-in cannot inherit energy from a later, louder section.
 */
function smooth(previous: number, target: number, hopSeconds: number): number {
  const tau = target > previous ? ATTACK_SECONDS : RELEASE_SECONDS;
  const alpha = 1 - Math.exp(-hopSeconds / tau);
  return clamp01(previous + (target - previous) * alpha);
}

/**
 * Sequential analyzer with independent per-channel filter state across chunk
 * boundaries. Call `push` with equal-length channel slices, then `finish` once
 * with the decoded duration.
 */
export class FeatureAnalyzer {
  private readonly lowState: [BiquadState, BiquadState] = [emptyState(), emptyState()];
  private readonly midState: [BiquadState, BiquadState] = [emptyState(), emptyState()];
  private readonly highState: [BiquadState, BiquadState] = [emptyState(), emptyState()];
  private readonly rms: number[] = [0];
  private readonly low: number[] = [0];
  private readonly mid: number[] = [0];
  private readonly high: number[] = [0];
  private samplesProcessed = 0;
  private hopFill = 0;
  private sums = [0, 0, 0, 0];
  private smoothed: FeatureSample = { rms: 0, low: 0, mid: 0, high: 0 };

  /** Total samples pushed so far; progress and the final timestamp use it. */
  get processed(): number {
    return this.samplesProcessed;
  }

  push(left: Float32Array, right: Float32Array): void {
    if (left.length !== right.length) {
      throw new Error("Analysis chunks must have equal channel lengths.");
    }

    for (let index = 0; index < left.length; index += 1) {
      const l = left[index];
      const r = right[index];
      // Mean channel power, never an L+R sum: opposite-phase stereo must not
      // cancel out of the analysis.
      this.sums[0] += (l * l + r * r) / 2;
      const lowL = stepBiquad(FEATURE_BANDS.low, this.lowState[0], l);
      const lowR = stepBiquad(FEATURE_BANDS.low, this.lowState[1], r);
      this.sums[1] += (lowL * lowL + lowR * lowR) / 2;
      const midL = stepBiquad(FEATURE_BANDS.mid, this.midState[0], l);
      const midR = stepBiquad(FEATURE_BANDS.mid, this.midState[1], r);
      this.sums[2] += (midL * midL + midR * midR) / 2;
      const highL = stepBiquad(FEATURE_BANDS.high, this.highState[0], l);
      const highR = stepBiquad(FEATURE_BANDS.high, this.highState[1], r);
      this.sums[3] += (highL * highL + highR * highR) / 2;

      this.samplesProcessed += 1;
      this.hopFill += 1;
      if (this.hopFill === HOP_SAMPLES) this.commitHop(HOP_SAMPLES);
    }
  }

  private commitHop(samples: number): void {
    const hopSeconds = samples / ANALYSIS_SAMPLE_RATE;
    const target: FeatureSample = {
      rms: powerToFeature(this.sums[0] / samples),
      low: powerToFeature(this.sums[1] / samples),
      mid: powerToFeature(this.sums[2] / samples),
      high: powerToFeature(this.sums[3] / samples),
    };
    this.smoothed = {
      rms: smooth(this.smoothed.rms, target.rms, hopSeconds),
      low: smooth(this.smoothed.low, target.low, hopSeconds),
      mid: smooth(this.smoothed.mid, target.mid, hopSeconds),
      high: smooth(this.smoothed.high, target.high, hopSeconds),
    };
    this.rms.push(this.smoothed.rms);
    this.low.push(this.smoothed.low);
    this.mid.push(this.smoothed.mid);
    this.high.push(this.smoothed.high);
    this.sums = [0, 0, 0, 0];
    this.hopFill = 0;
  }

  finish(duration: number): AudioFeatureTable {
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError("Analysis needs a positive audio duration.");
    }
    // The final partial hop averages only the samples that exist.
    if (this.hopFill > 0) this.commitHop(this.hopFill);
    return {
      version: FEATURE_ALGORITHM_VERSION,
      sampleRate: ANALYSIS_SAMPLE_RATE,
      hopSamples: HOP_SAMPLES,
      hopRate: HOP_RATE,
      duration,
      rms: Float32Array.from(this.rms),
      low: Float32Array.from(this.low),
      mid: Float32Array.from(this.mid),
      high: Float32Array.from(this.high),
    };
  }
}

function emptyState(): BiquadState {
  return { s1: 0, s2: 0 };
}

/**
 * Samples the table at an absolute track time. Values are linearly
 * interpolated between the two surrounding hop samples and clamped at both
 * ends; asking for a time outside the track never throws.
 */
export function sampleFeatures(table: AudioFeatureTable, timeSeconds: number): FeatureSample {
  const count = table.rms.length;
  if (!Number.isFinite(timeSeconds) || count === 0) {
    return { rms: 0, low: 0, mid: 0, high: 0 };
  }
  const lastIndex = count - 1;
  const time = Math.min(Math.max(timeSeconds, 0), table.duration);
  if (lastIndex === 0) return { rms: 0, low: 0, mid: 0, high: 0 };

  const position = time * table.hopRate;
  if (position >= lastIndex) {
    return {
      rms: table.rms[lastIndex],
      low: table.low[lastIndex],
      mid: table.mid[lastIndex],
      high: table.high[lastIndex],
    };
  }

  let index = Math.floor(position);
  let fraction = position - index;
  // The final stored sample sits at the exact duration, which can be slightly
  // earlier than the uniform grid when the last hop is partial.
  if (index >= lastIndex - 1) {
    const startTime = (lastIndex - 1) / table.hopRate;
    const span = table.duration - startTime;
    fraction = span > 0 ? (time - startTime) / span : 1;
  }
  fraction = clamp01(fraction);
  index = Math.min(index, lastIndex - 1);

  return {
    rms: lerp(table.rms[index], table.rms[index + 1], fraction),
    low: lerp(table.low[index], table.low[index + 1], fraction),
    mid: lerp(table.mid[index], table.mid[index + 1], fraction),
    high: lerp(table.high[index], table.high[index + 1], fraction),
  };
}

function lerp(from: number, to: number, fraction: number): number {
  return from + (to - from) * fraction;
}

/** Convenience for Node tests and non-chunked callers. */
export function analyzeFeatureChannels(
  left: Float32Array,
  right: Float32Array,
  duration: number,
): AudioFeatureTable {
  const analyzer = new FeatureAnalyzer();
  analyzer.push(left, right);
  return analyzer.finish(duration);
}
