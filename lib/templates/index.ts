import type { AnyTemplate } from "@/lib/renderer/template-schema";

import { FIRST_LIGHT_TEMPLATE } from "./first-light";
import { GRID_TEMPLATE } from "./grid";
import { ORBITAL_TEMPLATE } from "./orbital";
import { PULSE_TEMPLATE } from "./pulse";

export type TemplatePreset = {
  /** Stable key for the picker. */
  id: string;
  /** One line shown beside the name. */
  description: string;
  template: AnyTemplate;
  /** True only for scenes that use the 30 fps audio-reactive profile. */
  animated?: boolean;
};

/** Order matters: the first entry is what the studio opens with. */
export const TEMPLATE_PRESETS: readonly TemplatePreset[] = [
  {
    id: "first-light",
    description: "Lower third over a full-bleed photo",
    template: FIRST_LIGHT_TEMPLATE,
  },
  {
    id: "pulse",
    description: "Centred title on a soft scrim",
    template: PULSE_TEMPLATE,
  },
  {
    id: "grid",
    description: "Editorial split, text on the left",
    template: GRID_TEMPLATE,
  },
  {
    id: "orbital",
    description: "Audio-reactive orbital field · 30 fps",
    template: ORBITAL_TEMPLATE,
    animated: true,
  },
];

export const DEFAULT_TEMPLATE_ID = TEMPLATE_PRESETS[0].id;

/** The first audio-reactive preset; its ID is stable for the picker. */
export const ORBITAL_TEMPLATE_ID = "orbital";

export { buildOrbitalTemplate, MUSICAL_KEYS, ORBITAL_TEMPLATE } from "./orbital";
export { FIRST_LIGHT_TEMPLATE, GRID_TEMPLATE, PULSE_TEMPLATE };
