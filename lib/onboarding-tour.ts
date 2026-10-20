/**
 * Pure helpers behind the guided tour: no DOM construction, no React, so the
 * placement maths and the hands-on probes can be verified in Node.
 */

export type MeasuredRect = { left: number; top: number; width: number; height: number };

export type Viewport = { width: number; height: number };

export type TourPointer = {
  direction: "up" | "down" | "left" | "right";
  /** Horizontal offset inside the tooltip for vertical arrows. */
  left?: number;
  /** Vertical offset inside the tooltip for side arrows. */
  top?: number;
};

export type TourLayout = {
  step: number;
  rect: MeasuredRect | null;
  tooltip: { left: number; top: number; width: number };
  pointer: TourPointer | null;
  missing: boolean;
};

const EDGE = 16;
const TOOLTIP_WIDTH = 400;
const ESTIMATED_HEIGHT = 330;
const GAP = 20;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * Places the tooltip near a highlighted control without leaving the viewport.
 * Prefers below, then above, then the side of the control; the pointer always
 * sits on the edge that faces the control.
 */
export function measuredLayout(
  rect: MeasuredRect,
  viewport: Viewport,
  step: number,
  tooltipHeight = ESTIMATED_HEIGHT,
): TourLayout {
  const width = Math.max(0, Math.min(TOOLTIP_WIDTH, viewport.width - EDGE * 2));
  const height = clamp(tooltipHeight || ESTIMATED_HEIGHT, 0, viewport.height - EDGE * 2);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const belowTop = rect.top + rect.height + GAP;
  const aboveTop = rect.top - height - GAP;
  const left = clamp(centerX - width / 2, EDGE, viewport.width - width - EDGE);
  const pointerLeft = clamp(centerX - left, 26, width - 26);

  if (belowTop + height <= viewport.height) {
    return {
      step,
      rect,
      tooltip: { left, top: belowTop, width },
      pointer: { direction: "up", left: pointerLeft },
      missing: false,
    };
  }
  if (aboveTop >= EDGE) {
    return {
      step,
      rect,
      tooltip: { left, top: aboveTop, width },
      pointer: { direction: "down", left: pointerLeft },
      missing: false,
    };
  }

  const sideTop = clamp(centerY - height / 2, EDGE, viewport.height - height - EDGE);
  const rightLeft = rect.left + rect.width + GAP;
  if (rightLeft + width <= viewport.width - EDGE) {
    return {
      step,
      rect,
      tooltip: { left: rightLeft, top: sideTop, width },
      pointer: { direction: "left", top: clamp(centerY - sideTop, 26, height - 26) },
      missing: false,
    };
  }
  const leftLeft = rect.left - GAP - width;
  if (leftLeft >= EDGE) {
    return {
      step,
      rect,
      tooltip: { left: leftLeft, top: sideTop, width },
      pointer: { direction: "right", top: clamp(centerY - sideTop, 26, height - 26) },
      missing: false,
    };
  }

  // No edge gives the card a clean gap: keep it on screen and let it scroll.
  const top = clamp(belowTop, EDGE, viewport.height - height - EDGE);
  return {
    step,
    rect,
    tooltip: { left, top, width },
    pointer: { direction: top >= rect.top ? "up" : "down", left: pointerLeft },
    missing: false,
  };
}

/** Centered card used by steps that explain rather than point at a control. */
export function centeredLayout(step: number): TourLayout {
  return {
    step,
    rect: null,
    tooltip: { left: EDGE, top: EDGE, width: Math.min(420, TOOLTIP_WIDTH) },
    pointer: null,
    missing: false,
  };
}

/** A target that has not rendered yet keeps the explanation but loses the spotlight. */
export function missingLayout(step: number): TourLayout {
  return { ...centeredLayout(step), missing: true };
}

export function inputValue(doc: Document, selector: string): string {
  const field = doc.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  return field?.value ?? "";
}

export function hasFile(doc: Document, selector: string): boolean {
  return Boolean(doc.querySelector<HTMLInputElement>(selector)?.files?.length);
}

/** Number of removable tag chips currently rendered beside the input. */
export function tagCount(doc: Document, selector: string): number {
  const field = doc.querySelector(selector);
  return field?.parentElement?.querySelectorAll('button[aria-label^="Remove "]').length ?? 0;
}

export type PracticeProbe = {
  /** Polled probe against the live document. */
  check?: (doc: Document) => boolean;
  /** Marks the step done when this field changes from its value on entry. */
  watchValue?: string;
  /** Marks the step done when a tag chip is added to this input. */
  watchTags?: string;
};

export type PracticeBaseline = { value: string | null; tags: number | null };

/** Snapshots prefilled controls so "you changed it" is measurable. */
export function captureBaseline(probe: PracticeProbe, doc: Document): PracticeBaseline {
  return {
    value: probe.watchValue ? inputValue(doc, probe.watchValue) : null,
    tags: probe.watchTags ? tagCount(doc, probe.watchTags) : null,
  };
}

export function practiceSatisfied(
  probe: PracticeProbe,
  baseline: PracticeBaseline,
  doc: Document,
): boolean {
  if (probe.check?.(doc)) return true;
  if (
    probe.watchValue &&
    baseline.value !== null &&
    inputValue(doc, probe.watchValue) !== baseline.value
  ) {
    return true;
  }
  if (probe.watchTags && baseline.tags !== null && tagCount(doc, probe.watchTags) > baseline.tags) {
    return true;
  }
  return false;
}

export function producerNameChanged(doc: Document, savedName: string): boolean {
  return inputValue(doc, "#producer-name").trim() !== savedName;
}
