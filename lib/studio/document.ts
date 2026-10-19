import { z } from "zod";
import { parseTemplate, TEMPLATE_FONTS, graphicLayerSchema, type AnyTemplate, type RenderVariables } from "@/lib/renderer/template-schema";

export const VARIABLES = ["track_name", "filename", "producer_name", "bpm", "key", "year", "purchase_url", "message_text"] as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const keyframeSchema = z.object({ time: z.number().min(0).max(900), value: z.number().finite(), easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "step"]).default("linear") }).strict();
export const animationSchema = z.object({ property: z.enum(["x", "y", "scaleX", "scaleY", "rotation", "opacity"]), frames: z.array(keyframeSchema).min(1).max(100) }).strict();
export const nodeSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().max(100),
  type: z.enum(["text", "image", "rect", "ellipse", "line", "waveform", "progress", "orbital"]),
  x: z.number().finite(), y: z.number().finite(), width: z.number().positive().max(8192), height: z.number().positive().max(8192),
  rotation: z.number().min(-3600).max(3600).default(0), scaleX: z.number().min(0.01).max(20).default(1), scaleY: z.number().min(0.01).max(20).default(1),
  opacity: z.number().min(0).max(1).default(1), visible: z.boolean().default(true), locked: z.boolean().default(false), groupId: z.string().nullable().default(null),
  fill: color.default("#cabeff"), stroke: color.default("#ffffff"), strokeWidth: z.number().min(0).max(100).default(0), radius: z.number().min(0).max(2000).default(0),
  text: z.string().max(2000).default(""), fontFamily: z.enum(TEMPLATE_FONTS).default("Inter"), fontSize: z.number().min(8).max(500).default(64),
  fontWeight: z.number().int().min(100).max(900).default(600), letterSpacing: z.number().min(-20).max(100).default(0), align: z.enum(["left", "center", "right"]).default("left"), uppercase: z.boolean().default(false),
  minFontSize: z.number().min(1).max(500).default(16), lineHeight: z.number().min(1).max(2).default(1.1), maxLines: z.number().int().min(1).max(20).default(3), requires: z.enum(['bpm','key']).nullable().default(null),
  shadowBlur: z.number().min(0).max(100).default(0), shadowColor: color.default("#000000"), shadowOffsetX: z.number().finite().default(0), shadowOffsetY: z.number().finite().default(0),
  orbitalSettings: graphicLayerSchema.shape.settings.optional(), orbitalColors: graphicLayerSchema.shape.colors.optional(),
  binding: z.enum(["background_image", "logo", "asset"]).default("asset"), assetId: z.string().nullable().default(null), fit: z.enum(["cover", "contain"]).default("cover"),
  cropX: z.number().min(-1).max(1).default(0), cropY: z.number().min(-1).max(1).default(0), blur: z.number().min(0).max(50).default(0), brightness: z.number().min(0).max(3).default(1), contrast: z.number().min(0).max(3).default(1),
  endFill: color.default("#08080d"), gradient: z.boolean().default(false),
  start: z.number().min(0).max(900).default(0), end: z.number().min(0).max(900).nullable().default(null),
  fadeIn: z.number().min(0).max(30).default(0), fadeOut: z.number().min(0).max(30).default(0), animations: z.array(animationSchema).max(6).default([]),
  brandRole: z.enum(["none", "logo", "producer", "message", "color", "font"]).default("none"),
}).strict().superRefine((node, ctx) => {
  if (node.end !== null && node.end <= node.start) ctx.addIssue({ code: "custom", message: "Layer end must follow its start." });
  if (new Set(node.animations.map(a => a.property)).size !== node.animations.length) ctx.addIssue({ code: "custom", message: "Only one animation track per property is allowed." });
  for (const track of node.animations) {
    if (new Set(track.frames.map(f => f.time)).size !== track.frames.length) ctx.addIssue({ code: "custom", message: "Keyframe times must be unique." });
    if (track.property === "opacity" && track.frames.some(f => f.value < 0 || f.value > 1)) ctx.addIssue({ code: "custom", message: "Animated opacity must be 0–1." });
    if ((track.property === "scaleX" || track.property === "scaleY") && track.frames.some(f => f.value < 0.01 || f.value > 20)) ctx.addIssue({ code: "custom", message: "Animated scale must be 0.01–20." });
  }
});
export type StudioNode = z.infer<typeof nodeSchema>;
export type AnimationTrack = z.infer<typeof animationSchema>;
export const brandingSchema = z.object({ producerName: z.string().max(80), message: z.string().max(500), purchaseUrl: z.string().max(2000), logoAssetId: z.string().nullable(), color, fontFamily: z.enum(TEMPLATE_FONTS) }).strict();
export type Branding = z.infer<typeof brandingSchema>;
export const DEFAULT_BRANDING: Branding = { producerName: "", message: "", purchaseUrl: "", logoAssetId: null, color: "#cabeff", fontFamily: "Inter" };
export const documentSchema = z.object({
  schemaVersion: z.literal(3), id: z.string().min(1).max(100), name: z.string().trim().min(1).max(80), revision: z.number().int().min(1),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), parentId: z.string().nullable(),
  branding: brandingSchema.partial(),
  canvas: z.object({ width: z.literal(1920), height: z.literal(1080), backgroundColor: color, endColor: color.default("#08080d"), gradient: z.boolean().default(false) }).strict(),
  nodes: z.array(nodeSchema).max(100), thumbnail: z.string().max(500000).default(""),
}).strict().superRefine((doc, ctx) => {
  if (new Set(doc.nodes.map(n => n.id)).size !== doc.nodes.length) ctx.addIssue({ code: "custom", message: "Layer IDs must be unique." });
  if (doc.parentId === doc.id) ctx.addIssue({ code: "custom", message: "A template cannot inherit itself." });
});
export type StudioDocument = z.infer<typeof documentSchema>;
export function createNode(type: StudioNode["type"], patch: Partial<StudioNode> = {}): StudioNode {
  return nodeSchema.parse({ id: crypto.randomUUID(), name: type === "text" ? "Text" : type, type, x: 160, y: 160, width: type === "text" ? 1200 : 400, height: type === "text" ? 180 : 300, text: type === "text" ? "{{track_name}}" : "", ...patch });
}
export function createDocument(name = "Untitled template"): StudioDocument {
  const now = new Date().toISOString();
  return documentSchema.parse({ schemaVersion: 3, id: crypto.randomUUID(), name, revision: 1, createdAt: now, updatedAt: now, parentId: null, branding: {}, canvas: { width: 1920, height: 1080, backgroundColor: "#08080d" }, nodes: [], thumbnail: "" });
}
export function migratePreset(value: AnyTemplate): StudioDocument {
  const template = parseTemplate(value), doc = createDocument(template.name);
  doc.canvas.backgroundColor = template.canvas.backgroundColor;
  doc.nodes = template.layers.map(layer => {
    if (layer.type === "image") return createNode("image", { name: "Background", x: 0, y: 0, width: 1920, height: 1080, binding: layer.binding, fit: layer.fit, cropX: layer.offsetX, cropY: layer.offsetY, opacity: layer.opacity });
    if (layer.type === "rect") return createNode("rect", { x: layer.x, y: layer.y, width: layer.width, height: layer.height, fill: layer.fill, opacity: layer.opacity, radius: layer.radius });
    if (layer.type === "graphic") return createNode("orbital", { x: layer.box.x, y: layer.box.y, width: layer.box.width, height: layer.box.height, orbitalSettings: layer.settings, orbitalColors: layer.colors });
    return createNode("text", { name: layer.value, x: layer.x, y: layer.y, width: layer.maxWidth, height: layer.maxHeight ?? layer.fontSize * 3.3, text: layer.value, fontFamily: layer.fontFamily, fontWeight: layer.fontWeight, fontSize: layer.fontSize, minFontSize: layer.minFontSize, lineHeight: layer.lineHeight, requires: 'requires' in layer ? layer.requires ?? null : null, fill: layer.color, align: layer.align, uppercase: layer.uppercase, letterSpacing: layer.letterSpacing, stroke: layer.outline?.color ?? "#ffffff", strokeWidth: layer.outline?.width ?? 0, shadowBlur: layer.shadow?.blur ?? 0, shadowColor: layer.shadow?.color ?? "#000000", shadowOffsetX: layer.shadow?.offsetX ?? 0, shadowOffsetY: layer.shadow?.offsetY ?? 0, brandRole: layer.value.includes("producer_name") ? "producer" : layer.value.includes("message_text") ? "message" : "none" });
  });
  return doc;
}
export function resolveBranding(doc: StudioDocument, documents: StudioDocument[], brand: Branding = DEFAULT_BRANDING): Branding {
  const visited = new Set<string>();
  const resolve = (current: StudioDocument): Branding => {
    if (visited.has(current.id)) throw new Error("Template inheritance contains a cycle.");
    visited.add(current.id);
    let base = brand;
    if (current.parentId) { const parent = documents.find(d => d.id === current.parentId); if (!parent) throw new Error("The master template is missing. Select another master or remove inheritance."); base = resolve(parent); }
    return brandingSchema.parse({ ...base, ...current.branding });
  };
  return resolve(doc);
}
export function resolveDocument(doc: StudioDocument, documents: StudioDocument[], brand: Branding): { document: StudioDocument; branding: Branding } {
  const parsed = documentSchema.parse(doc), resolved = resolveBranding(parsed, documents, brand);
  const snapshot = structuredClone(parsed);
  snapshot.parentId = null; snapshot.branding = resolved;
  snapshot.nodes = snapshot.nodes.map(node => ({ ...node,
    ...(node.brandRole === "logo" ? { assetId: resolved.logoAssetId, binding: "asset" as const } : node.type === 'image' && node.binding === 'logo' && !node.assetId ? { assetId: resolved.logoAssetId } : {}),
    ...(node.brandRole === "color" ? { fill: resolved.color } : {}),
    ...(node.brandRole === "font" ? { fontFamily: resolved.fontFamily } : {}),
  }));
  return { document: snapshot, branding: resolved };
}
export function variablesForTrack(filename: string, values: RenderVariables, brand: Branding, now = new Date()): RenderVariables {
  return { filename, track_name: filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(), producer_name: brand.producerName, message_text: brand.message, purchase_url: brand.purchaseUrl, year: String(now.getFullYear()), ...values };
}
export function isMovingDocument(doc: StudioDocument): boolean {
  return doc.nodes.some(n => n.visible && (n.type === "orbital" || n.type === "waveform" || n.type === "progress" || n.animations.length > 0 || n.fadeIn > 0 || n.fadeOut > 0 || n.start > 0 || n.end !== null));
}
export function documentAssetIds(doc: StudioDocument): string[] { return [...new Set(doc.nodes.flatMap(n => n.type === "image" && n.assetId ? [n.assetId] : []))]; }

/** One resolver for the preview, approved scene and frozen per-track variables. */
export function trackSnapshot(track: {file: {name: string}; templateId: string; title: string; bpm: string; key: string; purchaseUrl: string}, templates: StudioDocument[], brand: Branding) {
  const source = templates.find(t => t.id === track.templateId);
  if (!source) throw new Error('Choose a saved template for every track.');
  const resolved = resolveDocument(source, templates, brand);
  return {...resolved, vars: variablesForTrack(track.file.name, {track_name: track.title.trim(), bpm: track.bpm, key: track.key, purchase_url: track.purchaseUrl || resolved.branding.purchaseUrl}, resolved.branding)};
}
export function resolveImageBindings(doc: StudioDocument, backgroundId: string | null): Record<string, string> {
  const bindings: Record<string,string> = {};
  for (const node of doc.nodes) {
    if (node.type !== 'image' || !node.visible) continue;
    const id = node.binding === 'background_image' ? backgroundId ?? node.assetId : node.assetId;
    if (!id) throw new Error(`Choose an image for layer “${node.name}”.`);
    const key = node.binding === 'asset' ? node.assetId! : node.binding;
    if (bindings[key] && bindings[key] !== id) throw new Error(`Conflicting images for binding “${key}”. Use separate asset layers.`);
    bindings[key] = id;
  }
  return bindings;
}
