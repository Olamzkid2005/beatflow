import {
  normalizeGraphicSettings,
  ORBITAL_DEFAULTS,
  type GraphicSettings,
} from "@/lib/renderer/graphics";
import { parseTemplate, type TemplateV2 } from "@/lib/renderer/template-schema";

/**
 * Orbital: the first audio-reactive preset (design section 12.1). Text stays in
 * fixed, non-overlapping bands; the graphic owns its reserved box and never
 * bleeds into them. The canvas is solid, so no photo is required. Selecting a
 * photo uses `buildOrbitalTemplate(..., { withImage: true })`, which adds the
 * image and its scrim explicitly rather than relying on a missing-asset
 * fallback.
 */
export const ORBITAL_TEMPLATE = parseTemplate({
  schemaVersion: 2,
  name: "Orbital",
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: "#08080d",
  },
  layers: [
    {
      type: "graphic",
      generator: "orbital-field",
      recipeRevision: 1,
      box: { x: 220, y: 220, width: 1480, height: 640 },
      colors: {
        base: "#0b0b12",
        ink: "#a49dc0",
        muted: "#4d4860",
        glow: "#e3dcff",
      },
      settings: ORBITAL_DEFAULTS,
    },
    {
      type: "text",
      value: "{{track_name}}",
      x: 96,
      y: 72,
      maxWidth: 1060,
      fontFamily: "Inter",
      fontWeight: 600,
      fontSize: 46,
      minFontSize: 24,
      maxHeight: 100,
      lineHeight: 1.1,
      color: "#f2efff",
      align: "left",
      uppercase: false,
      letterSpacing: -0.5,
    },
    {
      type: "text",
      value: "BPM {{bpm}}",
      x: 1320,
      y: 78,
      maxWidth: 230,
      fontFamily: "JetBrains Mono",
      fontWeight: 500,
      fontSize: 24,
      minFontSize: 16,
      maxHeight: 44,
      lineHeight: 1.1,
      color: "#cabeff",
      align: "left",
      uppercase: true,
      letterSpacing: 2,
      requires: "bpm",
    },
    {
      type: "text",
      value: "KEY {{key}}",
      x: 1600,
      y: 78,
      maxWidth: 224,
      fontFamily: "JetBrains Mono",
      fontWeight: 500,
      fontSize: 24,
      minFontSize: 16,
      maxHeight: 44,
      lineHeight: 1.1,
      color: "#cabeff",
      align: "left",
      uppercase: true,
      letterSpacing: 2,
      requires: "key",
    },
    {
      type: "text",
      value: "{{message_text}}",
      x: 96,
      y: 928,
      maxWidth: 1728,
      fontFamily: "Inter",
      fontWeight: 400,
      fontSize: 24,
      minFontSize: 16,
      maxHeight: 42,
      lineHeight: 1.1,
      color: "#c9c4d8",
      align: "left",
      uppercase: false,
      letterSpacing: 0,
    },
    {
      type: "text",
      value: "{{producer_name}}",
      x: 96,
      y: 994,
      maxWidth: 1728,
      fontFamily: "JetBrains Mono",
      fontWeight: 500,
      fontSize: 20,
      minFontSize: 12,
      maxHeight: 32,
      lineHeight: 1.1,
      color: "#cabeff",
      align: "left",
      uppercase: true,
      letterSpacing: 4,
    },
  ],
}) as TemplateV2;

/**
 * Builds the editable Orbital scene for one release. Appearance edits change
 * only the graphic settings; text boxes stay fixed. The optional image variant
 * is explicit, and the scene is re-validated after the edit.
 */
export function buildOrbitalTemplate(
  settings: GraphicSettings = ORBITAL_DEFAULTS,
  options: { withImage?: boolean } = {},
): TemplateV2 {
  const template = structuredClone(ORBITAL_TEMPLATE);
  const graphic = template.layers.find((layer) => layer.type === "graphic");
  if (!graphic || graphic.type !== "graphic") {
    throw new Error("The Orbital preset is missing its graphic layer.");
  }
  graphic.settings = normalizeGraphicSettings(settings);

  if (options.withImage) {
    template.layers.unshift(
      {
        type: "image",
        binding: "background_image",
        fit: "cover",
        offsetX: 0,
        offsetY: 0,
        opacity: 1,
      },
      {
        type: "rect",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        fill: "#05050a",
        opacity: 0.62,
        radius: 0,
      },
    );
  }

  return parseTemplate(template) as TemplateV2;
}

/** Pitch-class spellings offered as display metadata; never inferred. */
export const MUSICAL_KEYS = [
  "C major",
  "C minor",
  "C# major",
  "C# minor",
  "Db major",
  "Db minor",
  "D major",
  "D minor",
  "D# major",
  "D# minor",
  "Eb major",
  "Eb minor",
  "E major",
  "E minor",
  "F major",
  "F minor",
  "F# major",
  "F# minor",
  "Gb major",
  "Gb minor",
  "G major",
  "G minor",
  "G# major",
  "G# minor",
  "Ab major",
  "Ab minor",
  "A major",
  "A minor",
  "A# major",
  "A# minor",
  "Bb major",
  "Bb minor",
  "B major",
  "B minor",
] as const;
