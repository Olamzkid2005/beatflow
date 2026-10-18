/**
 * The one registered procedural graphic: `orbital-field`, revision 1 (design
 * section 12.3). Decorative marks only — no text, note names or invented tempo.
 *
 * Everything here is derived from the saved seed, the absolute track time and
 * the sampled features. There is no incremental rotation, spring or per-frame
 * randomness, so seeking straight to 42 s draws exactly the frame playback
 * would have reached.
 */
import type { FeatureSample } from "./audio-features";

export type GraphicSettings = {
  seed: number;
  ringCount: number;
  particleCount: number;
  tiltDeg: number;
  motion: {
    enabled: boolean;
    sensitivity: number;
    rotationRpm: number;
    maxPulse: number;
  };
};

export type GraphicColors = {
  base: string;
  ink: string;
  muted: string;
  glow: string;
};

export type GraphicBox = { x: number; y: number; width: number; height: number };

/** Authoring bounds, shared by the schema, the studio controls and the tests. */
export const ORBITAL_BOUNDS = {
  ringCount: { min: 1, max: 12 },
  particleCount: { min: 0, max: 1600 },
  tiltDeg: { min: 15, max: 65 },
  sensitivity: { min: 0, max: 2 },
  rotationRpm: { min: -4, max: 4 },
  maxPulse: { min: 0, max: 0.08 },
  seedMax: 0xffffffff,
} as const;

/** Cap on drawn ring segments and decorative markers (design section 12.3). */
export const MAX_RING_SEGMENTS = 720;
export const MAX_MARKERS = 24;

export const ORBITAL_DEFAULTS: GraphicSettings = {
  seed: 421337,
  ringCount: 8,
  particleCount: 1000,
  tiltDeg: 32,
  motion: {
    enabled: true,
    sensitivity: 1,
    rotationRpm: 0.75,
    maxPulse: 0.045,
  },
};

export type OrbitalRing = {
  phase: number;
  alpha: number;
  segments: Array<{ start: number; length: number; emphasis: number }>;
};

export type PreparedOrbital = {
  settings: GraphicSettings;
  colors: GraphicColors;
  particleCount: number;
  /** Normalised stipple positions (x, y pairs in 0–1). */
  dust: Float32Array;
  /** Normalised particle positions plus per-point size and alpha. */
  particles: Float32Array;
  particleSize: Float32Array;
  particleAlpha: Float32Array;
  rings: OrbitalRing[];
  markers: Array<{ angle: number; radius: number; length: number }>;
  texture: OffscreenCanvas | null;
};

export type GraphicFrame = {
  timeSeconds: number;
  durationSeconds: number;
  features: FeatureSample;
};

/** Mulberry32: a small, fixed PRNG whose output depends only on the seed. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Clamps a settings record to the published bounds. */
export function normalizeGraphicSettings(settings: GraphicSettings): GraphicSettings {
  return {
    seed: Math.trunc(clamp(settings.seed, 0, ORBITAL_BOUNDS.seedMax)) >>> 0,
    ringCount: Math.trunc(
      clamp(settings.ringCount, ORBITAL_BOUNDS.ringCount.min, ORBITAL_BOUNDS.ringCount.max),
    ),
    particleCount: Math.trunc(
      clamp(
        settings.particleCount,
        ORBITAL_BOUNDS.particleCount.min,
        ORBITAL_BOUNDS.particleCount.max,
      ),
    ),
    tiltDeg: clamp(settings.tiltDeg, ORBITAL_BOUNDS.tiltDeg.min, ORBITAL_BOUNDS.tiltDeg.max),
    motion: {
      enabled: Boolean(settings.motion.enabled),
      sensitivity: clamp(
        settings.motion.sensitivity,
        ORBITAL_BOUNDS.sensitivity.min,
        ORBITAL_BOUNDS.sensitivity.max,
      ),
      rotationRpm: clamp(
        settings.motion.rotationRpm,
        ORBITAL_BOUNDS.rotationRpm.min,
        ORBITAL_BOUNDS.rotationRpm.max,
      ),
      maxPulse: clamp(
        settings.motion.maxPulse,
        ORBITAL_BOUNDS.maxPulse.min,
        ORBITAL_BOUNDS.maxPulse.max,
      ),
    },
  };
}

/**
 * Builds the seeded, immutable geometry once per settings snapshot. Frames
 * reuse it; nothing is mutated while drawing.
 */
export function prepareOrbital(
  rawSettings: GraphicSettings,
  colors: GraphicColors,
): PreparedOrbital {
  const settings = normalizeGraphicSettings(rawSettings);
  const random = createRandom(settings.seed);

  const dust = new Float32Array(320 * 2);
  for (let index = 0; index < dust.length; index += 1) dust[index] = random();

  const particles = new Float32Array(settings.particleCount * 2);
  const particleSize = new Float32Array(settings.particleCount);
  const particleAlpha = new Float32Array(settings.particleCount);
  for (let index = 0; index < settings.particleCount; index += 1) {
    particles[index * 2] = random();
    particles[index * 2 + 1] = random();
    particleSize[index] = 0.6 + random() * 1.8;
    particleAlpha[index] = 0.08 + random() * 0.34;
  }

  const rings: OrbitalRing[] = [];
  let totalSegments = 0;
  for (let index = 0; index < settings.ringCount; index += 1) {
    const segmentCount = Math.min(
      18 + index * 6,
      Math.max(4, MAX_RING_SEGMENTS - totalSegments),
    );
    if (totalSegments >= MAX_RING_SEGMENTS) break;
    const segments = [] as OrbitalRing["segments"];
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const start = (segment / segmentCount) * Math.PI * 2 + random() * 0.12;
      const length = (Math.PI * 2) / segmentCount * (0.18 + random() * 0.5);
      segments.push({ start, length, emphasis: 0.35 + random() * 0.65 });
    }
    totalSegments += segmentCount;
    rings.push({ phase: random() * Math.PI * 2, alpha: 0.5 - index * 0.025, segments });
  }

  const markers: PreparedOrbital["markers"] = [];
  const markerCount = Math.min(MAX_MARKERS, 6 + settings.ringCount);
  for (let index = 0; index < markerCount; index += 1) {
    markers.push({
      angle: random() * Math.PI * 2,
      radius: 0.55 + random() * 0.5,
      length: 5 + random() * 12,
    });
  }

  return {
    settings,
    colors,
    particleCount: settings.particleCount,
    dust,
    particles,
    particleSize,
    particleAlpha,
    rings,
    markers,
    texture: createGrainTexture(random),
  };
}

function createGrainTexture(random: () => number): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const size = 256;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, size, size);
  for (let index = 0; index < 1400; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const alpha = 0.03 + random() * 0.16;
    context.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    context.fillRect(x, y, 1 + (random() > 0.85 ? 1 : 0), 1);
  }
  return canvas;
}

/** Patterns are context-owned; cache one per context instead of per frame. */
const patternCache = new WeakMap<object, CanvasPattern>();

/**
 * Draws one frame inside `box`. The caller may draw text afterwards; the
 * graphic is clipped to its own box and never moves text bands.
 */
export function drawOrbital(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  prepared: PreparedOrbital,
  box: GraphicBox,
  frame: GraphicFrame,
): void {
  const { settings, colors } = prepared;
  const motion = settings.motion;
  const time = Number.isFinite(frame.timeSeconds) ? frame.timeSeconds : 0;
  const energy = motion.enabled
    ? {
        low: clamp(frame.features.low * motion.sensitivity, 0, 1),
        mid: clamp(frame.features.mid * motion.sensitivity, 0, 1),
        high: clamp(frame.features.high * motion.sensitivity, 0, 1),
      }
    : { low: 0, mid: 0, high: 0 };

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) * 0.32;
  const pulse = 1 + energy.low * motion.maxPulse;
  const rotation = motion.enabled ? (motion.rotationRpm / 60) * Math.PI * 2 * time : 0;
  const tilt = (settings.tiltDeg * Math.PI) / 180;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();

  // Seeded stipple field: the reference's grainy dark field.
  ctx.fillStyle = colors.muted;
  for (let index = 0; index < prepared.dust.length; index += 2) {
    const alpha = 0.05 + energy.high * 0.06;
    ctx.globalAlpha = alpha;
    ctx.fillRect(
      box.x + prepared.dust[index] * box.width,
      box.y + prepared.dust[index + 1] * box.height,
      1,
      1,
    );
  }

  // Fine guides and a centred crosshair.
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x + 28, box.y + 28, box.width - 56, box.height - 56);
  ctx.beginPath();
  ctx.moveTo(box.x + 28, cy);
  ctx.lineTo(box.x + box.width - 28, cy);
  ctx.moveTo(cx, box.y + 28);
  ctx.lineTo(cx, box.y + box.height - 28);
  ctx.stroke();

  // Central disc with a restrained glow.
  const discRadius = radius * 0.72 * pulse;
  const gradient = ctx.createRadialGradient(cx, cy, 4, cx, cy, discRadius);
  gradient.addColorStop(0, colors.glow);
  gradient.addColorStop(0.45, colors.ink);
  gradient.addColorStop(1, colors.base);
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, discRadius, 0, Math.PI * 2);
  ctx.fill();

  // Cached grain clipped to the disc; brightness reacts only a little.
  if (prepared.texture) {
    let pattern = patternCache.get(ctx as unknown as object);
    if (!pattern) {
      const created = ctx.createPattern(prepared.texture, "repeat");
      if (created) {
        pattern = created;
        patternCache.set(ctx as unknown as object, created);
      }
    }
    if (pattern) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, discRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.3 + energy.high * 0.25;
      ctx.fillStyle = pattern;
      ctx.fillRect(cx - discRadius, cy - discRadius, discRadius * 2, discRadius * 2);
      ctx.restore();
    }
  }

  // Segmented, flattened ring system. Only segment emphasis reacts, so the
  // ring layout itself stays stable across frames.
  ctx.lineCap = "round";
  for (let ringIndex = 0; ringIndex < prepared.rings.length; ringIndex += 1) {
    const ring = prepared.rings[ringIndex];
    const major = radius * (0.86 + ringIndex * 0.075) * pulse;
    const minor = major * Math.sin(tilt) * 0.52;
    const spin = rotation * (1 + ringIndex * 0.04) + ring.phase;
    for (const segment of ring.segments) {
      const emphasis = clamp(segment.emphasis + energy.mid * 0.45 - 0.2, 0, 1);
      ctx.globalAlpha = clamp(ring.alpha * (0.45 + emphasis * 0.55), 0.05, 0.9);
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1 + ringIndex * 0.18;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        major,
        minor,
        -tilt * 0.35,
        segment.start + spin,
        segment.start + spin + segment.length,
      );
      ctx.stroke();
    }
  }

  // Decorative ticks: non-musical, seeded, and brightened by high-band energy.
  ctx.strokeStyle = colors.glow;
  ctx.lineWidth = 1.4;
  for (const marker of prepared.markers) {
    const angle = marker.angle + rotation;
    const inner = radius * 0.55 * marker.radius;
    const outer = inner + marker.length;
    ctx.globalAlpha = 0.25 + energy.high * 0.45;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner * Math.cos(tilt));
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer * Math.cos(tilt));
    ctx.stroke();
  }

  // A dense but bounded particle cluster near the disc.
  ctx.fillStyle = colors.ink;
  for (let index = 0; index < prepared.particleCount; index += 1) {
    const angle = prepared.particles[index * 2] * Math.PI * 2 + rotation * 0.6;
    const distance = radius * (0.35 + prepared.particles[index * 2 + 1] * 1.15) * pulse;
    ctx.globalAlpha = prepared.particleAlpha[index] * (0.6 + energy.high * 0.4);
    const size = prepared.particleSize[index];
    ctx.fillRect(
      cx + Math.cos(angle) * distance,
      cy + Math.sin(angle) * distance * Math.cos(tilt),
      size,
      size,
    );
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
