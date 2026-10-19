import type { AnimationTrack, StudioNode } from "./document";
export function easing(value: number, kind: AnimationTrack["frames"][number]["easing"]): number {
  const t = Math.max(0, Math.min(1, value));
  if (kind === "step") return t < 1 ? 0 : 1;
  if (kind === "ease-in") return t * t;
  if (kind === "ease-out") return 1 - (1 - t) ** 2;
  if (kind === "ease-in-out") return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  return t;
}
// Frames are replaced, never mutated in place, by the editor. Sorting them once
// per track avoids allocating and sorting on every one of thousands of frames.
const sortedFrames = new WeakMap<AnimationTrack, AnimationTrack["frames"]>();
function orderedFrames(track: AnimationTrack): AnimationTrack["frames"] {
  let frames = sortedFrames.get(track);
  if (!frames) {
    frames = [...track.frames].sort((a, b) => a.time - b.time);
    sortedFrames.set(track, frames);
  }
  return frames;
}
export function sampleTrack(track: AnimationTrack, time: number): number {
  const frames = orderedFrames(track);
  if (time <= frames[0].time) return frames[0].value;
  for (let i = 1; i < frames.length; i++) {
    if (time <= frames[i].time) {
      const a = frames[i - 1], b = frames[i];
      return a.value + (b.value - a.value) * easing((time - a.time) / (b.time - a.time), b.easing);
    }
  }
  return frames.at(-1)!.value;
}
export function evaluateNode(node: StudioNode, time: number, duration: number): StudioNode {
  const value = { ...node };
  for (const track of node.animations) value[track.property] = sampleTrack(track, time);
  const end = node.end === null ? duration : Math.min(node.end, duration);
  value.visible = node.visible && time >= node.start && time < end;
  const enter = node.fadeIn ? Math.min(1, Math.max(0, (time - node.start) / node.fadeIn)) : 1;
  const leave = node.fadeOut ? Math.min(1, Math.max(0, (end - time) / node.fadeOut)) : 1;
  value.opacity *= Math.min(enter, leave);
  return value;
}
