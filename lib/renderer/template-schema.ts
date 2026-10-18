import { z } from "zod";

/**
 * Template schema v1 (spec section 6). Templates are data, never code; every
 * template is validated before it is rendered. Keep this file free of React and
 * DOM imports so the schema and layout helpers stay testable in Node.
 */

export const TEMPLATE_SCHEMA_VERSION = 1;

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

/**
 * Variables available to `{{placeholders}}`. A value the user did not supply
 * resolves to an empty string — the renderer never invents one.
 */
export type RenderVariables = {
  track_name?: string;
  filename?: string;
  producer_name?: string;
  bpm?: string;
  key?: string;
  year?: string;
  purchase_url?: string;
};

export function parseTemplate(value: unknown): Template {
  return templateSchema.parse(value);
}

export function interpolateTemplateValue(value: string, vars: RenderVariables): string {
  return value.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    const key = name.toLowerCase() as keyof RenderVariables;
    return vars[key] ?? "";
  });
}
