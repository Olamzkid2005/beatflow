import { parseTemplate } from "@/lib/renderer/template-schema";

/**
 * The M1 preset: full-bleed photo, dark lower third, track title, producer
 * name. Parsed through the schema at module load so a bad edit fails fast.
 */
export const FIRST_LIGHT_TEMPLATE = parseTemplate({
  schemaVersion: 1,
  name: "First Light",
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: "#0c0c11",
  },
  layers: [
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
      y: 560,
      width: 1920,
      height: 520,
      fill: "#08080c",
      opacity: 0.62,
      radius: 0,
    },
    {
      type: "rect",
      x: 120,
      y: 758,
      width: 84,
      height: 6,
      fill: "#cabeff",
      opacity: 1,
      radius: 3,
    },
    {
      type: "text",
      value: "{{track_name}}",
      x: 120,
      y: 800,
      maxWidth: 1560,
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: 104,
      minFontSize: 52,
      maxHeight: 150,
      color: "#f2efff",
      align: "left",
      uppercase: false,
      letterSpacing: -1,
    },
    {
      type: "text",
      value: "{{producer_name}}",
      x: 122,
      y: 956,
      maxWidth: 1560,
      fontFamily: "JetBrains Mono",
      fontWeight: 500,
      fontSize: 30,
      minFontSize: 22,
      maxHeight: 40,
      color: "#cabeff",
      align: "left",
      uppercase: true,
      letterSpacing: 6,
    },
  ],
});
