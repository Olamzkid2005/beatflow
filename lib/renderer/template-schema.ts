import { z } from "zod";

import { ORBITAL_BOUNDS } from "./graphics";

/**
 * Template schemas v1 and v2 (spec section 6, design section 12.3). Templates
 * are data, never code; every template is validated before it is rendered.
 * Keep this file free of React and DOM imports so the schema and layout
 * helpers stay testable in Node.
 *
 * v1 is the static contract and remains unchanged. v2 adds a bounded graphic
 * layer and metadata text that is omitted when its variable is blank. The
 * concrete scene is token-free: a future authoring compiler resolves themes
 * into these literal colours.
 */

export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_SCHEMA_VERSION_V2 = 2;

/** Families the renderer may draw with. Kept in sync with `app/layout.tsx`. */
export const TEMPLATE_FONTS = ["Inter", "JetBrains Mono"] as const;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colors must be six-digit hex, for example #cabeff.");

const imageLayerSchema = z
  .object({
  type: z.literal("image"),
  binding: z.enum(["background_image", "logo"]),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** Normalized -1..1 crop offset across the available overflow. */
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
  opacity: z.number().min(0).max(1).default(1),
  })
  .strict();

const rectLayerSchema = z
  .object({
  type: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fill: hexColor,
  opacity: z.number().min(0).max(1).default(1),
  radius: z.number().min(0).default(0),
  })
  .strict();

const textLayerSchema = z
  .object({
  type: z.literal("text"),
  value: z.string().max(2000),
  x: z.number(),
  y: z.number(),
  maxWidth: z.number().positive(),
  fontFamily: z.enum(TEMPLATE_FONTS),
  fontWeight: z.number().int().min(100).max(900).default(700),
  fontSize: z.number().positive(),
  minFontSize: z.number().positive().default(28),
  /** Reserve vertical space so lines cannot run into other layers. */
  maxHeight: z.number().positive().max(4096).optional(),
  /** Line height as a multiple of the font size. */
  lineHeight: z.number().min(1).max(2).default(1.1),
  color: hexColor,
  align: z.enum(["left", "center", "right"]).default("left"),
  uppercase: z.boolean().default(false),
  letterSpacing: z.number().default(0),
  shadow: z
    .object({
      color: hexColor,
      blur: z.number().min(0),
      offsetX: z.number(),
      offsetY: z.number(),
    })
    .strict()
    .nullish(),
  outline: z
    .object({
      color: hexColor,
      width: z.number().positive(),
    })
    .strict()
    .nullish(),
  })
  .strict();

export const templateLayerSchema = z.discriminatedUnion("type", [
  imageLayerSchema,
  rectLayerSchema,
  textLayerSchema,
]);

export const templateSchema = z
  .object({
    schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
    name: z.string().min(1).max(80),
    canvas: z
      .object({
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
        backgroundColor: hexColor,
      })
      .strict(),
    layers: z.array(templateLayerSchema).max(30),
  })
  .strict();

export type Template = z.infer<typeof templateSchema>;
export type TemplateLayer = z.infer<typeof templateLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type RectLayer = z.infer<typeof rectLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;

const boxSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

const graphicSettingsSchema = z
  .object({
    seed: z.number().int().min(0).max(ORBITAL_BOUNDS.seedMax),
    ringCount: z
      .number()
      .int()
      .min(ORBITAL_BOUNDS.ringCount.min)
      .max(ORBITAL_BOUNDS.ringCount.max),
    particleCount: z
      .number()
      .int()
      .min(ORBITAL_BOUNDS.particleCount.min)
      .max(ORBITAL_BOUNDS.particleCount.max),
    tiltDeg: z
      .number()
      .min(ORBITAL_BOUNDS.tiltDeg.min)
      .max(ORBITAL_BOUNDS.tiltDeg.max),
    motion: z
      .object({
        enabled: z.boolean(),
        sensitivity: z
          .number()
          .min(ORBITAL_BOUNDS.sensitivity.min)
          .max(ORBITAL_BOUNDS.sensitivity.max),
        rotationRpm: z
          .number()
          .min(ORBITAL_BOUNDS.rotationRpm.min)
          .max(ORBITAL_BOUNDS.rotationRpm.max),
        maxPulse: z
          .number()
          .min(ORBITAL_BOUNDS.maxPulse.min)
          .max(ORBITAL_BOUNDS.maxPulse.max),
      })
      .strict(),
  })
  .strict();

export const graphicLayerSchema = z
  .object({
    type: z.literal("graphic"),
    generator: z.literal("orbital-field"),
    recipeRevision: z.literal(1),
    box: boxSchema,
    colors: z
      .object({
        base: hexColor,
        ink: hexColor,
        muted: hexColor,
        glow: hexColor,
      })
      .strict(),
    settings: graphicSettingsSchema,
  })
  .strict();

/** v2 text adds conditional visibility; a blank BPM/key draws nothing. */
const textLayerV2Schema = textLayerSchema.extend({
  requires: z.enum(["bpm", "key"]).optional(),
});

export const templateLayerV2Schema = z.discriminatedUnion("type", [
  imageLayerSchema,
  rectLayerSchema,
  textLayerV2Schema,
  graphicLayerSchema,
]);

/**
 * Concrete scene v2. Boxes are checked against the canvas so a graphic cannot
 * be declared outside the frame, and one graphic node is allowed in this
 * revision, matching the single registered recipe.
 */
export const templateV2Schema = z
  .object({
    schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION_V2),
    name: z.string().min(1).max(80),
    canvas: z
      .object({
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
        backgroundColor: hexColor,
      })
      .strict(),
    layers: z.array(templateLayerV2Schema).max(30),
  })
  .strict()
  .superRefine((template, context) => {
    const graphics = template.layers.filter((layer) => layer.type === "graphic");
    if (graphics.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["layers"],
        message: "This revision supports at most one graphic layer.",
      });
    }
    for (const [index, layer] of template.layers.entries()) {
      if (layer.type !== "graphic") continue;
      const { x, y, width, height } = layer.box;
      if (
        x < 0 ||
        y < 0 ||
        ![x, y, width, height].every(Number.isFinite) ||
        x + width > template.canvas.width ||
        y + height > template.canvas.height
      ) {
        context.addIssue({
          code: "custom",
          path: ["layers", index, "box"],
          message: "The graphic box must sit inside the canvas.",
        });
      }
    }
  });

export type TemplateV2 = z.infer<typeof templateV2Schema>;
export type TemplateLayerV2 = z.infer<typeof templateLayerV2Schema>;
export type GraphicLayer = z.infer<typeof graphicLayerSchema>;
export type TextLayerV2 = z.infer<typeof textLayerV2Schema>;
export type GraphicSettings = z.infer<typeof graphicSettingsSchema>;
export type AnyTemplate = Template | TemplateV2;
export type AnyTextLayer = TextLayer | TextLayerV2;
export type AnyLayer = TemplateLayer | TemplateLayerV2;

/**
 * Variables available to `{{placeholders}}`. A value the user did not supply
 * resolves to an empty string — the renderer never invents one.
 */
export type RenderVariables = {
  track_name?: string;
  filename?: string;
  producer_name?: string;
  message_text?: string;
  bpm?: string;
  key?: string;
  year?: string;
  purchase_url?: string;
};

export function parseTemplate(value: unknown): AnyTemplate {
  const version =
    typeof value === "object" && value !== null
      ? (value as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (version === TEMPLATE_SCHEMA_VERSION_V2) return templateV2Schema.parse(value);
  return templateSchema.parse(value);
}

/** True when the scene needs the audio-reactive 30 fps profile. */
export function isAnimatedTemplate(template: AnyTemplate): boolean {
  return (
    template.schemaVersion === TEMPLATE_SCHEMA_VERSION_V2 &&
    template.layers.some((layer) => layer.type === "graphic")
  );
}

export function interpolateTemplateValue(value: string, vars: RenderVariables): string {
  return value.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    const key = name.toLowerCase() as keyof RenderVariables;
    return vars[key] ?? "";
  });
}
