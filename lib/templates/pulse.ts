import { parseTemplate } from "@/lib/renderer/template-schema";

/**
 * M2 preset: centred composition. A full scrim keeps the title readable on any
 * photo, so it suits bright artwork where the lower third would get lost.
 */
export const PULSE_TEMPLATE = parseTemplate({
  schemaVersion: 1,
  name: "Pulse",
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: "#0a0a10",
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
      y: 0,
      width: 1920,
      height: 1080,
      fill: "#06060b",
      opacity: 0.44,
      radius: 0,
    },
    {
      type: "rect",
      x: 924,
      y: 424,
      width: 72,
      height: 6,
      fill: "#ffb4a2",
      opacity: 1,
      radius: 3,
    },
    {
      type: "text",
      value: "{{track_name}}",
      x: 280,
      y: 470,
      maxWidth: 1360,
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: 116,
      minFontSize: 56,
      maxHeight: 190,
      color: "#ffffff",
      align: "center",
      uppercase: false,
      letterSpacing: -2,
      shadow: { color: "#000000", blur: 24, offsetX: 0, offsetY: 8 },
    },
    {
      type: "text",
      value: "{{producer_name}}",
      x: 280,
      y: 664,
      maxWidth: 1360,
      fontFamily: "JetBrains Mono",
      fontWeight: 500,
      fontSize: 28,
      minFontSize: 20,
      maxHeight: 40,
      color: "#ffb4a2",
      align: "center",
      uppercase: true,
      letterSpacing: 8,
    },
  ],
});
