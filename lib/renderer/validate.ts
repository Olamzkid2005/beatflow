import { parseTemplate, type AnyTemplate, type RenderVariables } from "./template-schema";

/** Supported export frame rates. 1 fps remains the static default. */
export const MIN_FPS = 1;
export const MAX_FPS = 60;

/**
 * Rejects nonfinite, nonpositive and implausible frame rates before any canvas,
 * encoder or decoder resource is allocated. A public numeric option is not
 * trustworthy just because TypeScript says it is a number.
 */
export function normalizeFps(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError("fps must be a finite number.");
  }
  if (value < MIN_FPS || value > MAX_FPS) {
    throw new RangeError(`fps must be between ${MIN_FPS} and ${MAX_FPS}.`);
  }
  return value;
}

/**
 * H.264 requires even dimensions. The schema is intentionally permissive for
 * authoring; the export boundary is not.
 */
export function assertExportCanvas(canvas: { width: number; height: number }): void {
  const { width, height } = canvas;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new RangeError("Export dimensions must be positive whole numbers.");
  }
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new RangeError(`Export dimensions must be even; received ${width}×${height}.`);
  }
  if (width > 4096 || height > 4096) {
    throw new RangeError("Export dimensions cannot exceed 4096 px.");
  }
}

export type RenderSnapshot = {
  template: AnyTemplate;
  vars: RenderVariables;
};

/**
 * Validates and detaches the render input. Later edits to the caller's objects
 * cannot change frames after the job has started.
 */
export function snapshotRenderInput(input: {
  template: unknown;
  vars?: RenderVariables;
}): RenderSnapshot {
  const template = parseTemplate(input.template);
  assertExportCanvas(template.canvas);
  const vars: RenderVariables = structuredClone(input.vars ?? {});
  return { template, vars };
}
