# Orbital — original local image pack

Generated with seeded Canvas 2D drawing, not an external image-generation service or a copied reference screenshot. Source: `tools/orbital-art.mjs`. No image service/API key/dependency was added.

## Use the right files

| File | Size | Use |
| --- | --- | --- |
| `background-monochrome.jpg` | 1920×1080 | Clean silver/charcoal fog; text-free background |
| `background-obsidian.jpg` | 1920×1080 | Clean near-black background |
| `background-umber.jpg` | 1920×1080 | Clean warm-dust background |
| `grain-alpha.png` | 256×256 | Transparent white grain tile, tint/composite later |
| `stipple-alpha.png` | 256×256 | Transparent white stipple tile, tint/composite later |
| `orbital-preview.png` | 1920×1080 | Flattened static concept with SAMPLE title/metadata; review only |
| `orbital-thumbnail.jpg` | 320×180 | Flattened concept thumbnail; not wired into picker |
| `asset-sheet.jpg` | 1600×1370 | Labeled overview for visual review |
| `manifest.json` | JSON | Roles, dimensions, byte sizes, SHA-256 |

The three backgrounds contain **no text, disc or rings**. The dynamic graphic must remain procedural/separate. Do not use `orbital-preview.png` as an editable background. Alpha tiles decode through today's loader, but the current app has no texture binding; that future integration is not supplied here. Backgrounds can already be selected via the existing background file input, but are not automatically added to its picker/library.

## Prototype

`public/prototypes/orbital/index.html` is an isolated interactive visual prototype. On an existing Next server use `/prototypes/orbital/index.html`. Alternatively:

```bash
node tools/generate-orbital-images.mjs --serve
# http://127.0.0.1:3136/prototypes/orbital/
```

It supports editable text/message, background variants, ring count, response, seed, seek, play/pause/reset and a genuine PNG download. Motion is **synthetic**, not audio analysis. No audio, saved presets, MP4 or upload integration. The one-line prototype text fit is not the production multiline typography contract. Font is the project's existing JetBrains Mono with its OFL license copied beside it. Stop the local server with Ctrl-C.

## Reproduce / verify

```bash
node tools/generate-orbital-images.mjs                 # regenerates eight images + manifest
node tools/generate-orbital-images.mjs --verify-only   # no image changes
node tools/generate-orbital-images.mjs --check-prototype
```

Chrome is required; use `CHROME_PATH` for another installation. Generation overwrites only the named pack files. The browser is temporary, uses a fresh profile, and is cleaned up. Native PNG/JPEG byte encoding can vary by browser version even with a stable drawing seed.

Verification on Chrome 155.0.8059.80: eight images, 4,604,335 total bytes (~4.39 MiB), all dimensions/hash/signatures checked; native Image decoding plus actual `decodeImageFile()` passed; texture alpha and opaque backgrounds checked; no external page HTTP requests. Prototype tests cover controls, deterministic seek, pixel changes, play/pause/reset, no autoplay/reduced-motion pause, desktop/mobile overflow and actual downloaded 1920×1080 PNG. Screenshots: `public/prototypes/orbital/desktop-preview.png` and `mobile-preview.png`.

Automated pixel/interaction checks are not an independent visual-quality approval, WCAG audit or production motion/performance certification. Owner visual review remains required. See `docs/template-system-design.md` sections 13–14 and `docs/findings.md` executor runbook before production implementation.
