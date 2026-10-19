import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth.js reads `headers()`/`cookies()` on every request, so the app relies on
  // standard dynamic rendering rather than the experimental cache components.
  cacheComponents: false,
  outputFileTracingIncludes: {
    "/ffmpeg/*": ["./node_modules/@ffmpeg/core/dist/umd/*", "./node_modules/@ffmpeg/ffmpeg/dist/umd/*.js"],
  },
  // The project lives in ~/Documents, and a stray lockfile in the home directory
  // confuses root detection.
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
