# BeatFlow template system — image/text and audio-reactive graphic designs

Date: 18 October 2026

Status: **proposed design, not implemented**. Two owner-confirmed directions: **independent background image and editable text layers**, and **procedural graphic templates with audio-reactive motion from the start**. Both use reusable layout/theme presets; an uploaded/saved image and local guided reconstruction from a reference video are optional authoring inputs, not requirements for a generated graphic. Approach 2's integration contract is in section 12. No AI API, external media transfer, new dependency, or hosted storage is required by this design.

## Design approach 1 — independent background and editable text (owner-confirmed)

Recorded: 18 October 2026. This is the **first design approach**; leave room for the owner's next idea rather than treating it as the only final workflow. Documentation only; no implementation is authorized by this record.

### What the owner means

The background and the overlaid text are independent layers. A background image is not the finished template. Using the supplied concert screenshot as a visual reference:

```text
Layer 1: Background image                 → upload a new image or reuse a saved one
Layer 2: Large title (example: “Blame”)    → editable track name
Layer 3: Commercial-use message           → editable reusable message; can be hidden
Optional: Producer branding and panels    → separate from the background
```

“Purchase This Track For Commercial Use” is editable text, not pixels that must be included in the uploaded background. The title and message each retain their own position, alignment, font choice, size range, and color. The example's large title is serif; the current app only ships Inter and JetBrains Mono, so matching that exact style requires an approved self-hosted serif font later. Do not promise exact font fidelity from the screenshot.

### Create and reuse

1. Choose a layout/preset or start a new design; a reference video is **optional**, not required.
2. **Upload background image** from the computer, or **Choose saved background** from the local library/preset.
3. Add/edit the title and reusable message independently, and preview the composition.
4. Save the arrangement/styles as a named preset. Offer **Remember this background with the preset**; otherwise require a background per release.
5. For the next release, keep the preset and saved background, or replace only the image. Change the track name without rebuilding the design.

Reuse means the actual saved image asset, not a screenshot of an exported video with text already flattened onto it. If only a flattened reference is available, use a clean/replacement image or explicitly accept that old lettering remains baked in; no automatic text removal is implied.

**Save distinctions:**

- **Save background:** keep the normalized image as a reusable local asset, independent of text, so several presets can share it.
- **Save preset:** keep layout/theme, default message and visibility, and an optional reference to a saved background. Do not save the release's track title/audio as preset defaults.
- **Replace for this release:** override the image or message without silently modifying the saved preset or other releases.
- **Update preset / Save as new:** explicit actions to persist changes; duplicate before changing a shared design if the original should remain available.

Background replacement must not reset text content/style/positions. Text edits must not change the stored image. Saved asset references are immutable: replacing an image creates a new asset/reference, not an overwrite affecting other presets. Preset exports include any referenced saved image; backgrounds/presets remain browser-local unless exported as backups.

### Acceptance for approach 1

- New background image + editable title + editable/hideable message can be previewed and rendered as separate layers.
- Saved preset reopens with its default message and optional saved image after reload; the owner can reuse that image without another file selection.
- A saved image can be selected for another preset; no new physical upload or external transfer is required.
- Replacing only the background preserves title/message placement and theme. Changing title/message preserves the saved background.
- One-release overrides do not mutate the preset; explicit updates/new presets do. Duplicated presets and shared backgrounds are not changed by edits elsewhere.
- Title, message and optional branding have nonoverlapping bounded text regions, and preview/export use the same composition.
- No reference-video selection, AI service or source-code edit is required for this image-first workflow.

## Design approach 2 — procedural graphics with audio-reactive motion (owner-confirmed)

The second reference is an orbital/scientific-style composition: dark stippled field, a grainy central disc, tilted segmented rings, fine guides and compact monospaced metadata. The owner chose **audio-reactive motion from the start**, not a static-only first version. Recreate that visual vocabulary with a bounded built-in graphic recipe, not a flattened screenshot or arbitrary executable template. Do not reproduce the social app's like/comment/share controls. A still reference cannot establish its original motion or prove that its note labels reflect real pitch detection.

Section 12 specifies the proposed appearance, controls, data versions, deterministic audio features, preview/export loop, resource limits and codebase integration. This expands the earlier static-only design; application implementation remains a separate task.

## 1. Product decision

The image-first action is **Create design → choose background → edit text → save preset**. The graphic-first action is **Choose graphic preset → add track → adjust appearance/reactivity → preview → save/render**. **Create from reference video** is an optional guided entry to the same layer model, not a prerequisite. All avoid “edit JSON.”

Optional reference-assisted flow:

```text
Choose local video → pick frame → choose a layout → mark editable regions
                  → match colors/type → test with new content → save
```

The reference is a visual guide, not a source of recoverable design layers. The owner identifies text areas and chooses fonts/styles. This version does not automatically recognize words, identify fonts, remove text, recover hidden background pixels, or reconstruct animation. Do not advertise it as a one-click exact clone.

For a typical static beat-video design, aim to make authoring a short guided task. Do not promise a completion time before usability testing.

**Core model:**

- **Layout:** where things go and in which order they are drawn.
- **Theme:** colors, typography, and permitted visual treatments.
- **Preset:** a named layout/theme pairing, optional assets, and a few controlled customizations. Graphic presets also save a bounded generator recipe/seed and motion settings, never executable code or track-specific analysis.
- **Release content:** track title, producer name, background, audio, and optional message override for one render. Not a new template. The preset supplies the reusable message default.

A layout repair should benefit new presets using that layout; saved presets must not silently change when a definition is revised.

## 2. Scope and acceptance contract

Deliver this design in `docs/template-system-design.md`. Application implementation is a separate task.

The proposed feature must:

1. Produce 1920×1080 designs with at most 30 ordered layers, rendered through the same scene engine for preview/export. Preserve the static 1 fps path; add a separate validated 30 fps audio-reactive profile for graphic scenes as specified in section 12.
2. Keep reference video processing local and reject unsupported/corrupt media with useful errors. No audio extraction or upload is needed to create a template.
3. Let the owner create a design directly from an image, choose a generated graphic, or optionally map a reference; edit title, reusable message and branding without writing code, choose approved fonts, sample colors, and save multiple named presets.
4. Require a clean/replacement background for a genuinely replaceable design, or explicitly label a captured frame as flattened artwork.
5. Prevent title/brand overlap and unacknowledged text truncation; snapshot validated data at render start.
6. Save presets/assets transactionally in browser IndexedDB, with portable JSON backup and an honest local-storage warning.
7. Preserve built-in presets and existing upload/history behavior during migration.

This extends the original build spec's fixed-preset-only scope. It permits guided region mapping and a bounded library of procedural graphics with deterministic audio-reactive motion. It is not approval for a general drag-and-drop editor, timeline, arbitrary SVG/HTML, template scripts, remote URL importer, automatic reconstruction of reference animation, or AI integration.

## 3. Alternatives considered

### A. Copy complete template objects

Keep one full layer array per design. This is the smallest change to current code and remains the migration fallback, but duplicates geometry and styling. Fixing a title box in 30 copied designs becomes 30 edits. It also gives a beginner too many unrelated controls.

### B. General editor/constraint language

Let every template define arbitrary constraints, expressions, groups, plugins, and computed styles. It can model many designs, but makes validation, imports, deterministic rendering, and a simple guided workflow harder. It is unnecessary for static beat videos and is not selected.

### C. Bounded layout + semantic theme + saved preset — selected

Use ordinary validated data, a few known layer types, explicit boxes, and role-based theme tokens. The wizard creates or forks a layout when a reference needs different geometry. Most variants just select another theme. The compiler hides token resolution, compatibility checks, provenance, validation, and snapshot creation behind one operation.

There is no runtime template inheritance, executable expression language, or arbitrary deep-merge override system. More layouts can be added without changing the renderer when they use supported primitives.

## 4. Owner-facing workflow

The image-first entry uses the owner-confirmed approach above and skips reference capture/normalization. The following steps describe the **optional reference-video entry**, converging on the same layout/theme/preset data.

### Step 1 — Choose reference video

- Use a local file input, not a URL downloader. Button copy: “Choose reference video — processed on this device.”
- Open through the installed Mediabunny `Input`/`BlobSource` with a supported video track; check decoder capability before requesting frames.
- Read metadata, not `file.arrayBuffer()` for the entire video. Use seek/trimmed frame requests rather than decoding the full timeline.
- Offer a muted native video scrubber, timestamp field, and a capture action. Reference audio is never imported into the template.
- A short initial strip of up to three sampled frames is optional; samples are extracted sequentially, not concurrently. They are not an automatic guarantee that the design is static.
- Pick a frame with no fade, transition, subtitles, visualizer obstruction, or transient title. For the static reference-mapping entry show “Motion is not imported; this template will be static.” Choosing Orbital separately uses its own generated motion, not recovered motion from this video.

Use `CanvasSink.getCanvas(timestamp)` with a bounded sink size/pool and dispose the input when done. It returns the frame active at the requested timestamp (or null before the first frame), so display the actual returned frame timestamp. Copy a selected result before reusing a pooled canvas. Do not retain decoded frames for the whole source video.

### Step 2 — Normalize the reference

The template canvas is always 1920×1080. For a different aspect ratio, explicitly choose **crop to fill** or **fit with bars** and preview the result. Respect source rotation/display dimensions.

Draw the normalized reference into one canonical canvas. Every authoring box is measured against that canvas, not raw video pixels. Pointer coordinates map from the actual displayed canvas rectangle back to 1920×1080; exclude any CSS padding/borders. This prevents the same click producing different geometry at different browser widths.

### Step 3 — Map the design

Begin with “Lower third,” “Centered,” or “Split panel,” or a minimal background/title/brand layout. Provide these guided actions:

1. “Mark the track-title area.”
2. “Mark the reusable message area” or “No message.”
3. “Mark producer branding” or “No producer text.”
4. “Add a panel/accent” if needed.

A click-and-drag selection defines a rectangle. Numeric x/y/width/height fields and keyboard adjustment are always available. This is region selection, not a full freeform design editor. Start from sensible boxes and safe margins; do not require drawing everything manually.

For title/brand choose the semantic field, approved font, size range, alignment and maximum lines. No OCR is implied: sample words are typed by the owner. A separate preview uses a different track name to prove the region is actually editable.

The layer list has explicit move-up/down controls. Maximum 30 layers, unique layer IDs, finite bounds, and no arbitrary HTML/code. Initially support background, opaque/translucent panels, accents, title, optional reusable message and optional branding. Small logo placement is a later capability unless the renderer box/asset plumbing is implemented in the same approved slice.

### Step 4 — Match the theme and choose artwork

Use a same-origin canvas color sampler or supported native picker with a manual hex input fallback. Font matching is manual using Inter/JetBrains Mono initially; never claim the exact source font was detected.

**Default: reference-only.** The captured frame appears beside or faintly behind the authoring view but is never included in export. Choose a clean background image, keep a background slot to supply per release, or use a solid canvas color.

**Optional: flattened artwork.** Store the selected frame as a background only after a warning: “Old titles, logos, and graphics remain baked into this image.” The owner must acknowledge it. Covering words with a solid panel is possible, but is not background reconstruction/inpainting. Show the badge “Flattened background” in the library. Reference fidelity and future theme recoloring are limited for baked-in elements.

For a portable reusable design, prefer a clean background and recreate panels/text with actual layers. Only use media/artwork the owner has permission to reuse.

### Step 5 — Test and save

- Side-by-side reference/reconstruction, with an optional comparison slider.
- Built-in stress cases: short title, 3-line title, long unbroken word, accented/non-Latin text/emoji, long/missing branding, light/dark/portrait background.
- Highlight text overflow and editable-region conflicts. Do not label intentional panel/background overlap as an error.
- Name the preset, choose tags, select “Save as new” or “Update this custom preset.” Built-ins are read-only; Duplicate makes a custom copy.
- Save only after fonts resolve, geometry validates, and any truncation/flattened-artwork warning is acknowledged. Storage errors leave the draft visible and offer a JSON export; do not show “Saved” before commit.

Later normal use is simply **pick preset → keep or replace its saved background → provide track content → render**. A preset without a saved image requires a release image. The reusable message defaults from the preset and may be edited/hidden for that release. No repeated video analysis is needed.

## 5. Data contracts

All types below are **proposed authoring-format v1**, not exports currently available in the repository. Zod remains the runtime validator. Colors must additionally match six-digit hex; numeric dimensions/weights/spacing must pass the bounds specified below. Types alone are not input validation.

```ts
export type Font = "Inter" | "JetBrains Mono";
export type ColorToken = "canvas" | "panel" | "title" | "message" | "brand" | "accent";
export type TextRole = "title" | "message" | "brand";
export type ContentField = "track_name" | "message_text" | "producer_name";
export type Box = { x: number; y: number; width: number; height: number };
export type DefinitionRef = { id: string; revision: number };

export type LayoutNode =
  | {
      id: string;
      type: "image";
      box: Box;
      binding: "background_image";
      fit: "cover" | "contain";
    }
  | {
      id: string;
      type: "rect";
      box: Box;
      fill: ColorToken;
      opacity: number;
      radius: number;
    }
  | {
      id: string;
      type: "text";
      box: Box;
      field: ContentField;
      role: TextRole;
      fontSize: number;
      minFontSize: number;
      maxLines: 1 | 2 | 3;
      lineHeight: number;
      align: "left" | "center" | "right";
    };

export type LayoutDefinition = {
  formatVersion: 1;
  id: string;
  revision: number;
  name: string;
  canvas: { width: 1920; height: 1080 };
  layers: LayoutNode[];
};

export type ThemeDefinition = {
  formatVersion: 1;
  id: string;
  revision: number;
  name: string;
  colors: Record<ColorToken, string>;
  text: Record<TextRole, {
    fontFamily: Font;
    fontWeight: number;
    uppercase: boolean;
    letterSpacing: number;
  }>;
};

export type PresetDefinition = {
  formatVersion: 1;
  id: string;
  revision: number;
  name: string;
  tags: string[];
  message: { text: string; visible: boolean };
  layout: DefinitionRef;
  theme: DefinitionRef;
  overrides: {
    accent?: string;
    panelOpacity?: number;
  };
  background:
    | { mode: "per-release" }
    | { mode: "solid" }
    | {
        mode: "saved-image";
        assetId: string;
        flattened: boolean;
      };
};

export type TemplateBundle = {
  formatVersion: 1;
  preset: PresetDefinition;
  layout: LayoutDefinition;
  theme: ThemeDefinition;
};
```

### Ownership and compatibility rules

- **Layout owns geometry, layer order, binding, alignment, size range, line count/height, panel radius and base opacity.** Theme changes cannot move a title or change a box's height.
- **Theme owns colors, font families/weights, case and spacing.** Font or spacing changes can affect fit, so validate layout/theme combinations with actual fonts, not only geometry.
- **Preset overrides are small and explicit:** `accent` replaces `theme.colors.accent`; `panelOpacity` replaces opacity only on rect nodes whose fill is `panel`. No array-index patches or generic recursive merging.
- Title-role nodes bind `track_name`; message-role nodes bind `message_text`; brand-role nodes bind `producer_name`. Each role uses its corresponding theme color token. At least one title is required; message/branding are optional. A visible preset message requires a message node and nonblank text; bound its text to 500 characters. Other literal text/extra fields remain a separately versioned capability.
- Resolve `message_text` from the preset's message default unless explicitly overridden for the release; release overrides take precedence. Hiding a message omits its drawing without moving the title/branding or collapsing reserved space. Hidden nodes remain in the layout for later reuse. Preview and export resolve content/visibility identically. Extend the concrete renderer's current variable allow-list with `message_text`; this field is proposed, not currently wired in the app.
- `solid` background mode is allowed only for layouts without an image node; its canvas color comes from the theme. `per-release` and `saved-image` require exactly one background image node. Changing between these modes is an explicit edit, not a silent missing-image fallback.
- Image nodes compile with default crop offsets of zero. Per-release crop is release state, not a template/theme property; changing the default crop can become a future named option. A crop of the reference is already baked into the normalized reference image.
- IDs are opaque stable strings; revisions are positive integers. Use namespaced built-in IDs (`builtin:lower-third`) and generated custom IDs (`custom:<uuid>`). Names are labels, not keys. Validate imports using maps/strict objects, never unchecked property assignment.
- Revisions are immutable. Updating a layout/theme creates a new revision. Existing presets keep their exact references until the owner explicitly updates them and reviews the preview. Duplicate without geometry changes can reuse references; editing a built-in/shared layout forks a custom definition.
- Saving a preset never saves the release's audio, title or full reference video. A generated thumbnail uses sample content. A reference-only frame is temporary unless the owner opts to retain it for later comparison.

### Validation policy

Strict, versioned Zod objects; reject unknown keys so unsupported features do not silently vanish. Validate unique layer IDs, at most 30 layers, name length 1–80, tags bounded to 20 tags of 40 characters, known tokens/fonts/fields, finite numbers, and positive integer revisions.

Boxes must fit within the canvas and have positive width/height. Text editable regions must not overlap each other; panels/images may overlap them by design. Default safe margin is 64 px, shown as a guide rather than an unexplained restriction. Limit font size to 12–240 px, `12 <= minFontSize <= fontSize`, weight to 100–900, line height to 1–2 em, letter spacing to -4–16 px, opacity to 0–1, radius to 0–half the smaller box dimension. These are initial authoring bounds, not claims about existing schema behavior.

## 6. Example: one layout, many themes

The following JSON is a complete proposed bundle fixture. It does **not** parse through today's renderer schema; it goes through the proposed authoring validator/compiler first.

```json
{
  "formatVersion": 1,
  "preset": {
    "formatVersion": 1,
    "id": "custom:night-card",
    "revision": 1,
    "name": "Night Card",
    "tags": ["photo", "lower-third"],
    "message": { "text": "Purchase This Track For Commercial Use", "visible": true },
    "layout": { "id": "builtin:lower-third", "revision": 1 },
    "theme": { "id": "builtin:midnight", "revision": 1 },
    "overrides": {},
    "background": { "mode": "per-release" }
  },
  "layout": {
    "formatVersion": 1,
    "id": "builtin:lower-third",
    "revision": 1,
    "name": "Lower third",
    "canvas": { "width": 1920, "height": 1080 },
    "layers": [
      {
        "id": "background", "type": "image",
        "box": { "x": 0, "y": 0, "width": 1920, "height": 1080 },
        "binding": "background_image", "fit": "cover"
      },
      {
        "id": "panel", "type": "rect",
        "box": { "x": 64, "y": 620, "width": 1792, "height": 396 },
        "fill": "panel", "opacity": 0.92, "radius": 20
      },
      {
        "id": "accent", "type": "rect",
        "box": { "x": 112, "y": 654, "width": 88, "height": 6 },
        "fill": "accent", "opacity": 1, "radius": 3
      },
      {
        "id": "title", "type": "text", "field": "track_name", "role": "title",
        "box": { "x": 112, "y": 690, "width": 1696, "height": 216 },
        "fontSize": 88, "minFontSize": 36, "maxLines": 3,
        "lineHeight": 1.1, "align": "left"
      },
      {
        "id": "message", "type": "text", "field": "message_text", "role": "message",
        "box": { "x": 112, "y": 942, "width": 1696, "height": 42 },
        "fontSize": 28, "minFontSize": 18, "maxLines": 1,
        "lineHeight": 1.1, "align": "left"
      },
      {
        "id": "brand", "type": "text", "field": "producer_name", "role": "brand",
        "box": { "x": 112, "y": 120, "width": 1696, "height": 42 },
        "fontSize": 28, "minFontSize": 18, "maxLines": 1,
        "lineHeight": 1.1, "align": "left"
      }
    ]
  },
  "theme": {
    "formatVersion": 1,
    "id": "builtin:midnight",
    "revision": 1,
    "name": "Midnight",
    "colors": {
      "canvas": "#0c0c11", "panel": "#08080c", "title": "#f2efff",
      "message": "#f2efff", "brand": "#cabeff", "accent": "#cabeff"
    },
    "text": {
      "title": { "fontFamily": "Inter", "fontWeight": 700, "uppercase": false, "letterSpacing": -1 },
      "message": { "fontFamily": "Inter", "fontWeight": 400, "uppercase": false, "letterSpacing": 0 },
      "brand": { "fontFamily": "JetBrains Mono", "fontWeight": 500, "uppercase": true, "letterSpacing": 4 }
    }
  }
}
```

To create “Warm Card,” reuse the same layout revision and make a separate theme revision with cream text, a brown panel and orange accent. To create “Mint Card,” change theme tokens again. Geometry and bindings are untouched. Themes are not applied to pixels baked into a saved background image.

A starter set of **three repaired layouts × four tested themes = twelve candidate combinations**. Enable all twelve only after combination tests pass. These counts are a proposed starting catalog, not a measured performance claim or a limit on saved presets.

## 7. Compiler and renderer boundary

One main authoring operation:

```text
compilePreset(bundle: unknown)
  → { template: TemplateV2, provenance: exact definition IDs/revisions }
  or a structured list of { path, code, message } issues
```

`TemplateV2` is a concrete, token-free renderer scene with `schemaVersion: 2`. It is **not today's `Template` type**. The compiler is pure, React/DOM-free and synchronous; it does no font loading, decoding, storage, network I/O or code evaluation.

Compilation order:

1. Strictly parse authoring documents; confirm preset references exactly match bundled IDs/revisions.
2. Validate geometry, role/field matches, background-mode compatibility and override bounds.
3. Resolve theme tokens and role styles, applying only named overrides.
4. Emit full concrete image/rect/text layers with unique IDs, title/message/brand placeholders, and fixed 1920×1080 canvas. Attach text height/maxLines/lineHeight/overflow and image box to the concrete scene.
5. Parse the concrete scene schema; return its detached copy and provenance. Do not hold mutable authoring objects in the result.

The concrete renderer schema needs these explicit changes before the system ships:

- Stable layer `id`.
- Text `maxHeight`, `maxLines`, `lineHeight`, and `overflow: "ellipsis"`; existing x/y/maxWidth keep their meaning.
- Image x/y/width/height with cover/contain crop clipped to its box. Full-canvas defaults preserve current image appearance. Small logo/artwork support is not implied until asset bindings and inputs also support it.
- Fixed export dimensions, safe finite numeric limits, bounded known fonts/bindings.

`prepareScene()` is the browser-side companion: wait for the exact fonts, interpolate a copied variable map, measure text and return positioned line runs plus diagnostics. Both preview and export draw those prepared runs. An explicit content-independent compile is not sufficient to prove text fits; actual content/font measurement happens here.

Resolve artwork before calling the renderer: `per-release` requires the chosen release image; `saved-image` loads the saved Blob unless the owner explicitly selects a one-release replacement; `solid` has no background image. A missing required asset blocks preview/export instead of silently substituting the reference. The proposed v2 render input must permit an absent background for solid scenes (today's `RenderInput` requires a `File`) and verify required bindings from the concrete scene. Preserve the current required-background call pattern for legacy v1 callers. Reference videos/comparison frames are never implicit render inputs.

### Text fitting contract

At each candidate font size from requested size down to the exact minimum:

1. Apply uppercase before measuring; use actual approved font/weight and spacing.
2. Word-wrap; measure the same letter spacing used for drawing **exactly once**, accounting for Canvas implementations that include it in `measureText`.
3. Require every line's glyph/effect bounds to fit horizontally and vertically within the text box at the specified line height. Use actual font ascent/descent where available, with a tested conservative fallback.
4. Return the largest fitting candidate. If none fits, ellipsize within both width and available line count at the minimum; preserve grapheme clusters, not arbitrary UTF-16 code-unit slices. Use the browser's `Intl.Segmenter` or a documented compatible fallback.
5. If even an ellipsis cannot fit, return an error; never silently paint outside the box. Clip defensively to the box, but clipping is not an acceptable substitute for fitting.

No per-template shadow/outline in the initial authoring format. Existing v1 effects must be preserved by the migration path; future effect editing requires accounting for effect extents and a format revision. A nonempty title is required for actual export. Truncation produces a visible diagnostic and requires acknowledgement for the current content, not a global “ignore all” setting.

### Render snapshot

At the start of preview/export, validate/clone scene data and copy variables before awaits. A render job uses that snapshot and resolved asset files for its entire lifetime; later theme/draft edits cannot change it. Keep assets alive for the job, release them on completion/cancel, and keep the existing one-render-at-a-time limit. No changes to video/audio codecs or FPS defaults are required for static layout/theme composition. Audio-reactive scenes use the separate frame profile and preparation contract in section 12.

## 8. Storage, import/export and library

### Local persistence

Use a separate IndexedDB database **`beatflow-templates`**, initially version 1, with stores:

- `layouts` and `themes`: compound key `[id, revision]`.
- `presets`: key `id`, containing the current revision and exact references.
- `assets`: key `id`, containing decoded/normalized raster Blob, dimensions, MIME type and purpose. Reusable background assets also have a display name and library visibility flag; selecting an existing asset does not duplicate its bytes. Presets refer to immutable asset IDs. Standalone saved backgrounds remain available even when no preset currently references them.
- `thumbnails`: key `presetId`, containing a small raster Blob and a signature of the preset/definition revisions used.

Separate storage avoids breaking the existing `beatflow` history adapter's hard-coded database version. This is a proposed schema, not a migration of the current history database.

Put all newly referenced documents/assets and the preset in **one transaction**; report success only on `tx.oncomplete`. On abort, preserve the draft and prior saved preset. Retry transient open failures, close connections on version change, and handle blocked upgrades explicitly. Never silently switch a durable “saved” template into temporary memory without telling the owner.

Editing a built-in creates a custom preset. Duplicate reuses immutable definition/asset references until edited. Delete removes that preset only; do not delete assets still referenced elsewhere. Initial implementation can keep orphaned assets until an explicit library cleanup, rather than risk premature deletion.

Saved reference video: **never**. Comparison frame: temporary by default; persist only by explicit opt-in, with an optional `comparisonAssetId` in the local preset record's library metadata (outside the compositional `PresetDefinition`). Flattened background/clean saved image: persist normalized pixels intentionally. Thumbnails and JSON exports contain visible artwork/text, so warn that backups may contain personal content. No object URLs in saved data; construct and revoke them per session.

### Portable backup

Export **`<preset-slug>.beatflow-template.json`** with:

```text
{
  packageVersion: 1,
  bundle: TemplateBundle,
  comparisonAssetId?: string,
  assets: [{ id, mimeType, width, height, dataBase64 }]
}
```

Include required background assets and an opted-in comparison frame; `comparisonAssetId`, when present, must reference an included asset and is restored as library metadata, not a render binding. Omit cached thumbnails and the source video. A layout or theme does not contain data URLs. Base64 is deliberately simple for initial small raster packages; ZIP/large asset packages are deferred to avoid another dependency.

On import: size-check before reading text, strictly validate schemas and references, limit decoded bytes, decode/re-encode only supported PNG/JPEG/WebP images to confirm dimensions/content, reject SVG/scripts/remote URLs, and save atomically. Always assign a new custom preset ID; map imported asset IDs to new IDs and remap references. Reuse existing layout/theme revisions only when canonical content is identical; otherwise fork IDs instead of overwriting a matching ID with different data. Updating an existing local preset is a separate explicit operation.

### Initial resource limits — proposed, to benchmark

- Reference file: 500 MiB and 30 minutes by default; reject before decoding where metadata permits. Expose limits centrally rather than scattered magic numbers.
- Reference track: at most 3840×2160 display pixels; normalized selected frame: at most 1920×1080. Larger decoder allocations are browser-dependent; this is not a peak-memory guarantee.
- At most three small strip previews and one full selected reference frame; one extraction request in flight. Cancel/replacement invalidates stale results and releases decoder resources.
- Persisted images: at most 8 MiB each, normalized to at most 1920 px on the long edge. Export package: at most 32 MiB UTF-8 JSON, eight assets, and 16 MiB total decoded asset bytes. Check dimensions/pixel count too, not MIME/extension alone.
- Library thumbnails: up to 320×180; create lazily for visible presets with a small LRU of live decoded images (initial target 12). Never allocate a full-resolution canvas per library item.
- No limit on preset count tied to rendering concurrency. Listing hundreds of metadata records is not the same as decoding hundreds of images; paginate/render a bounded visible slice as the catalog grows.

Measure frame-capture latency, sequential seek/cancel memory, thumbnail memory and preview response on representative hardware before calling it lightweight. Do not infer performance from successful schema validation.

## 9. Integration and migration

### Proposed file responsibilities

These are planned paths, not files created by this design task:

```text
lib/templates/authoring-schema.ts     layout/theme/preset/package validation
lib/templates/compile.ts              compilePreset(), pure composition
lib/templates/layouts.ts              immutable built-in layout definitions
lib/templates/themes.ts               immutable built-in theme definitions
lib/templates/store.ts                transactional local library/assets
lib/templates/reference.ts            local video frame extraction/disposal
lib/templates/index.ts                existing public catalog adapter
lib/renderer/template-schema.ts       versioned v1/v2 scene parsers/migration
lib/renderer/scene.ts                 shared measured drawing/text-box fitting
components/template-importer.tsx      guided reference-to-template wizard
components/render-studio.tsx          select resolved preset, supply release content
```

Keep definitions in ordinary TypeScript data initially, matching current conventions; saved/exported custom definitions are JSON. No service, library, CSS framework or editor framework is added. Section 12 extends these responsibilities for graphic scenes without replacing this composition/storage boundary.

### Safe migration sequence

1. **Renderer safety prerequisite:** add versioned v2 schema, bounded text fitting, image boxes, runtime validation/snapshot, and browser regression tests. Current v1 remains readable; never pass a v2 document through today's v1 parser, which strips unrecognized fields.
2. **Convert the three built-ins:** map First Light→lower-third, Pulse→centered, Grid→split-panel. Preserve public picker IDs `first-light`, `pulse`, `grid` and default ordering. Retain the old v1 definitions until compatibility tests pass. Fix title geometry deliberately; do not claim repaired layouts are pixel-identical to defective originals.
3. **Legacy v1 handling:** renderer adapter can preserve old visuals with full-canvas image bounds and legacy text rules, but legacy/unbounded designs must be reviewed and assigned valid boxes before publishing as new authoring presets. Do not silently invent bounded geometry or erase shadow/outline. Editing unsupported legacy effects either retains them in a legacy preset or explicitly asks to simplify; it must not silently drop them.
4. **Composition layer:** enable explicit, tested layout/theme pairs through the existing catalog adapter. Each pair resolves to a concrete v2 scene; renderer stays unaware of catalog search/storage.
5. **Guided importer:** add local reference capture and bounded region controls; commit custom presets/assets; use catalog adapter to surface built-ins plus customs without requiring source-code changes.
6. **Library convenience:** thumbnails, search, tags, favorites and JSON import/export. No need to enumerate every possible combination as a separate saved file; persist named favorites/presets intentionally.

Built-ins are source-controlled and reconstructible; custom presets are browser-local and require exported backups to move devices. Editing a template never changes downloaded videos, prior YouTube uploads, settings, or upload history.

## 10. Tests and definition of done

### Pure Node tests

- Every built-in layout/theme/preset validates; IDs/revisions match and duplicate layer IDs fail.
- Unknown fields/versions/tokens/fonts/bindings, NaN/infinite dimensions, invalid boxes/opacity/spacing, role-field mismatches and over-30 layers fail with actionable paths.
- All enabled layout/theme pairs compile deterministically, produce token-free 1920×1080 scenes and leave inputs untouched. Editing the source object after compilation cannot change output.
- Accent/panel overrides affect only named targets; theme swaps leave geometry/bindings/order unchanged; revision changes do not silently update saved presets.
- Backup round-trip retains required definitions/assets; identity collisions remap rather than overwrite; missing/oversized/invalid assets reject before save.
- Storage transaction failure preserves prior preset and does not leave dangling references; do not reuse the history adapter's request-success-before-commit behavior.

### Real Chrome/Edge browser tests

- Local reference upload, scrub, frame selection and cancel/replacement use actual decodable media; corrupt/unsupported/audio-only videos fail clearly. Rotated, non-16:9 and first-frame timestamp cases have defined results.
- Network observation confirms **zero reference video/frame/asset requests to server or external endpoints**. Normal app/auth requests are allowed; this does not claim the entire authenticated app is offline-capable.
- Reference-only graphics never appear in exports; flattened mode warns and retains baked-in text honestly; choosing clean per-release backgrounds removes dependency on reference pixels.
- Region coordinates remain correct at different UI sizes. Numeric/keyboard controls provide the same geometry as pointer selection.
- Actual fonts: short/long/unbroken/Unicode titles and missing/long branding fit reserved boxes. Fix the previously reproduced First Light/Pulse collision and First Light clipping; assert both horizontal and vertical bounds.
- Truncation is announced; extremely small boxes error instead of drawing outside. Layout/theme font changes trigger fresh fit diagnostics; font load failures do not silently save fallback previews.
- Preview and exported frame match for the same scene/vars/assets, apart from documented codec/color differences; download remains a valid MP4 with video/audio tracks. Reference audio is not used.
- Preset survives reload with its default message/visibility and optional saved background; the same saved background can be selected by another preset. Changing/clearing a one-release background or message does not mutate saved defaults; explicit preset updates do. Custom duplicate is independent after editing, assets resolve, save failure stays unsaved, JSON export/import works through actual UI and malformed packages do not mutate the library.
- Image-first approach requires no reference video. Title/message are editable independent layers; replacing the image retains text geometry/style, hiding the message does not shift the title, and export includes no old reference lettering unless the owner explicitly chose flattened artwork.
- Creation/replacement during render/upload respects existing operation locks and discard confirmations; no silent active-job destruction or stale artifact handoff.
- Navigation/cancel/unmount disposes decoders, bitmaps, URLs and timers; measure repeated-reference memory and library thumbnail residency on the target laptop.

### Explicit non-goals and unresolved measurements

No automatic OCR/font identification, AI reconstruction/inpainting, automatic reconstruction of reference motion, pitch/MIDI transcription, arbitrary layer scripts, remote video import, timeline, cloud synchronization, or exact-reference fidelity guarantee. Bounded procedural audio-reactive motion is included in approach 2; a general waveform/spectrum editor is not. No new performance measurements have been run for this design. The existing codec/YouTube acceptance gates remain separate and are not closed by authoring this document.

## 11. Decision summary

**First owner-confirmed approach: choose an uploaded or saved background image, overlay independent editable title/message layers, and save a reusable preset.** A local guided reference-video wizard is an optional way to author the same layout/theme data, not a mandatory step. Back both with a small pure compiler and transactional custom-preset/background library. Start with safe editable title/message/brand regions and manual font/color matching. Use references only as guides by default. Keep the current shared renderer, validate/snapshot at its boundary, and introduce bounded text before multiplying presets.

**Second owner-confirmed approach: generated graphic templates that react to the chosen audio from their first release.** This adds a graphic node, deterministic track analysis and a timestamped drawing/encoding path; it cannot be delivered by simply adding another static template object.

The owner should experience either “choose/reuse a background, edit text, preview, save” or “choose a graphic, add audio, adjust reactivity, preview, save.” Both keep text editable and share layout/theme compilation, local presets and the MP4 upload handoff. The detailed graphic contract follows. Further owner ideas remain possible; these are complementary approaches, not two separate applications.

## 12. Approach 2 — orbital graphic and motion integration

### 12.1 What the composition will look like

Adapt the reference to the existing **1920×1080 landscape output**; do not stretch the nearly square screenshot or quietly change every preset to portrait. A later square/vertical output needs its own dimension/codec/layout acceptance. The first built-in working name is **Orbital**, picker ID `orbital`, appended after the existing three presets so the default stays unchanged.

Proposed landscape arrangement (all values are design-space pixels):

| Element | Placement / behavior |
| --- | --- |
| Canvas | Near-black field, optional uploaded/saved photo below generated layers |
| Title | Editable `track_name`, box `(96, 72, 1060, 100)`, initially 46 px, minimum 24 px, max two lines |
| Metadata | Manual optional BPM `(1320, 78, 230, 44)` and key `(1600, 78, 224, 44)`, JetBrains Mono, 24 px, minimum 16 px |
| Graphic | Bounded box `(220, 220, 1480, 640)`; central disc, flattened tilted ring system, restrained markers and a seeded stipple field |
| Message | Independent editable/hideable text `(96, 928, 1728, 42)`, 24 px, minimum 16 px |
| Producer | Optional branding `(96, 994, 1728, 32)`, 20 px, minimum 12 px |

These boxes do not overlap. They are a proposed starting composition, **not measured font-fit results**. Title/message/brand retain approach 1's actual-font fitting and truncation diagnostics. Generated marks are decorative, not extra title boxes. The graphic is clipped to its own box and leaves the text bands undisturbed even at maximum pulse.

Layer order is explicit: canvas → optional image → optional scrim → graphic → editable title/metadata/message/brand. An image is optional: a pure generated scene works without any background upload. Selecting a photo creates/uses an image-capable layout variant; it does not silently violate the solid/image compatibility rules. Graphics do not recolor image pixels.

Visual treatment:

- Cached low-resolution stipple/noise, a clipped grain disc and segmented elliptical rings approximate the reference in Canvas 2D. This is a stylized 2D projection, not a physics simulation or genuine 3D renderer.
- Slow timestamp-based rotation; bass changes disc/ring scale slightly; middle-band energy changes segment emphasis; higher-band energy changes a small amount of grain/marker brightness. Text stays still and readable.
- No large flashes, whole-screen pulsing, rapid random flicker or automatic camera shake. Keep the main field/texture stable; only bounded properties react.
- The reference's small note labels are not proof of detected notes. Initial decorative markers use non-musical indices/coordinates. BPM/key are explicitly entered display metadata; omitted values omit their labels/separator. Never invent a key, BPM or note sequence from energy analysis.
- The screenshot is a design guide only. Its pixels, old title and social controls do not become saved artwork unless the owner separately chooses acknowledged flattened-image mode.

### 12.2 Owner-facing controls

Extend the current studio, not a separate editor product. The existing built-ins keep their simple photo/text controls. Orbital reveals:

1. **Content:** track title, optional producer/message, optional manually entered BPM/key; MP3 selection is reused.
2. **Appearance:** approved palette, graphic size/position within its reserved region, ring count, particle density, tilt and **Shuffle pattern** (stores a new seed). Geometry edits fork the layout; seed/count/tilt edits change the preset recipe.
3. **Motion:** enabled, sensitivity, rotation speed and maximum pulse. Audio-reactive is the default for Orbital. Every control has documented numeric bounds; no expression inputs or per-particle editing.
4. **Preview:** native source-audio play/pause/seek plus a synchronized canvas. Before audio is ready, show a still **Design preview — add audio for reactive motion**, not a pretend audio-reactive loop. After analysis, play the actual selected track.
5. **Save preset / Save as new:** appearance, motion, layout/theme and reusable message defaults persist. Do not persist release audio, feature arrays, release title, manual BPM/key or playback position in a reusable preset. Backgrounds use the existing proposed immutable asset references.
6. **Render MP4:** show the resolved profile, duration, conservative output estimate, progress and cancel. An explicit **Still export** may freeze the graphic at a chosen timestamp and use 1 fps, but must say that reactivity will not be exported. Never silently downgrade a failed animated export to still.

Controls have native inputs, labels, keyboard equivalents, visible errors and an announced analysis/render state. No autoplay. Honor `prefers-reduced-motion` by starting with a paused design preview; this must not silently change the exported template. The owner can explicitly choose a still output. Disabling motion removes both time rotation and energy response; the frozen frame time/seed are recorded in that render's snapshot.

### 12.3 Bounded graphic data, not executable templates

Approach 1's authoring-format v1 remains a **static** contract. Add an explicitly discriminated **authoring-format v2** for graphic-capable definitions; do not append fields to a v1 object and hope today's parser preserves them. Because the proposed concrete renderer v2 has not shipped, its strict layer union can include graphics/metadata in the same approved implementation. If a static concrete v2 ships first, bump the concrete schema version for this addition instead of retroactively changing persisted semantics.

Proposed extension types, using section 5's types (not application exports):

```ts
export type GraphicColorToken =
  | "graphicBase" | "graphicInk" | "graphicMuted" | "graphicGlow";

export type GraphicNode = {
  id: string;
  type: "graphic";
  box: Box;
  generator: "orbital-field";
  recipeRevision: 1;
};

export type MetadataNode =
  Omit<Extract<LayoutNode, { type: "text" }>, "field" | "role"> & {
    role: "metadata";
    field: "bpm" | "key";
  };

export type GraphicSettings = {
  seed: number;
  ringCount: number;
  particleCount: number;
  tiltDeg: number;
  motion: {
    enabled: boolean;
    sensitivity: number;
    rotationRpm: number;
    maxPulse: number;
  };
};

export type LayoutDefinitionV2 = Omit<LayoutDefinition, "formatVersion" | "layers"> & {
  formatVersion: 2;
  layers: (LayoutNode | MetadataNode | GraphicNode)[];
};

export type ThemeDefinitionV2 = Omit<ThemeDefinition, "formatVersion" | "colors" | "text"> & {
  formatVersion: 2;
  colors: Record<ColorToken | GraphicColorToken, string>;
  text: Record<TextRole | "metadata", ThemeDefinition["text"]["title"]>;
};

export type PresetDefinitionV2 = Omit<PresetDefinition, "formatVersion"> & {
  formatVersion: 2;
  graphics: Record<string, GraphicSettings>;
};

export type TemplateBundleV2 = {
  formatVersion: 2;
  preset: PresetDefinitionV2;
  layout: LayoutDefinitionV2;
  theme: ThemeDefinitionV2;
};
```

Responsibilities remain narrow:

- **Layout** owns graphic box, z-order, approved generator ID and recipe revision. First release permits **one graphic node**; it counts as one of 30 layers but has its own internal primitive budget. Two metadata nodes at most, one per field, use the theme's metadata style and brand color. They do not satisfy the required title role.
- **Theme** owns the four graphic color tokens and typography; a theme swap does not change seed/counts/geometry. Old themes need explicit v2 graphic colors before they are offered with Orbital; do not manufacture untested layout/theme pairs.
- **Preset** owns one settings record for each graphic node ID, with no missing/extra keys. Overrides remain named, not arbitrary object patches. `accent` still affects the `accent` token only; Orbital colors are changed through its graphic palette, not hidden coupling.
- **Compiler** validates the generator/revision, resolves tokens to concrete hex colors and emits one `graphic` layer containing its detached settings. Metadata becomes bounded concrete text with approved `{{bpm}}` / `{{key}}` bindings and conditional unit formatting; a blank field draws nothing, not `BPM` by itself. No new music-metadata field is needed in today's `RenderVariables`, which already declares both, but studio inputs and strict value validation are missing today.
- **Renderer** dispatches only to known TypeScript generators. Imported JSON cannot provide a module path, URL, shader, callback, SVG, JS or mathematical expression. Unsupported recipe revisions fail visibly. Versioned generator behavior must remain stable for saved seeds.

Initial bounds: seed unsigned 32-bit integer; integer counts of 1–12 rings and 0–1600 particles; tilt 15–65 degrees; sensitivity 0–2; signed rotation -4–4 RPM; maximum pulse 0–0.08 of base scale. Everything is finite. Optional BPM is a decimal from 20–300, formatted consistently without rounding away a supplied fraction; optional key is a bounded selection of pitch class (with enharmonic spelling) plus major/minor. Empty means unknown. These are display inputs, not audio-analysis results. The generator reserves room for its largest pulse and clips defensively. Cap internal ring segments at 720 total, markers at 24 and procedural texture at 256×256. Theme colors remain six-digit hex; use only bounded opacities. Counts cannot be multiplied by an imported expression or audio amplitude.

One proposed settings fixture (a fragment, **not** a complete v2 bundle):

```json
{
  "seed": 421337,
  "ringCount": 8,
  "particleCount": 1000,
  "tiltDeg": 32,
  "motion": {
    "enabled": true,
    "sensitivity": 1,
    "rotationRpm": 0.75,
    "maxPulse": 0.045
  }
}
```

The local database may store versioned document records under the existing proposed `[id, revision]` keys; parser dispatch checks each document's format version. A graphic backup uses **`packageVersion: 2`** with a v2 bundle and the same bounded asset envelope; v1 backups remain readable as static. Reject unknown versions, validate all references and remap identities atomically. Save **no analysis arrays or PCM** in either backup or the preset library.

### 12.4 Audio features: deterministic and shared, not live-only

Reuse `decodeAudioFile()` for the chosen release audio: decoded 48 kHz stereo PCM is the common timeline for feature extraction and AAC export. Do not decode once for preview and again for export, or require audible real-time playback to render.

Proposed analysis algorithm v1:

- Analyze the entire allowed track once, in sequential bounded chunks. Maintain independent filter state per stereo channel across chunk boundaries. Compute mean channel **power**, not an L+R waveform sum that can cancel opposite-phase audio.
- Use explicitly fixed, versioned biquad coefficients/order at 48 kHz for low (40–180 Hz), middle (180–2000 Hz) and high (2000–12000 Hz) bands. These are broad filter bands with rolloff, not exact brick-wall FFT bins or note detection. Freeze coefficients in the implementation and test their frequency response.
- Full-band RMS plus the three band RMS values form four features. Use 800-sample hops (**60 Hz**) and a documented final partial-hop rule (average only actual samples). Start filter/smoothing state at zero; store an initial zero sample at time zero and subsequent samples at hop end times, with the final one exactly at audio duration.
- Map RMS to normalized 0–1 using a fixed -60 to 0 dBFS range, silence floor and clamping; do not normalize every track's loudest noise into a full pulse. Apply causal attack/release smoothing with 10 ms attack and 160 ms release using actual hop duration. Recipe sensitivity is applied/clamped later and does not force re-analysis.
- `sampleFeatures(time)` clamps to the decoded duration and linearly interpolates adjacent stored samples on that explicitly defined timeline. At most one hop of interpolation look-ahead is shared by preview/export. Verify perceptual transient alignment; do not hide an arbitrary offset in the preview only.

Represent results as four `Float32Array`s plus duration, hop/sample-rate and algorithm-version metadata. Except for the final partial hop, timestamps are implicit. At 15 minutes, four features at 60 Hz occupy approximately **0.83 MiB**, excluding small metadata; that is the feature table only, not total render memory. Versioned deterministic tests compare floats within a specified tolerance, not bit-identical browser promises.

Do not use a live `AnalyserNode` as the sole export driver: playback speed, seek history and requestAnimationFrame scheduling would change the result. BPM is not used to fake beat pulses; actual band energy drives the effect. Automatic beat/tempo/key/pitch recognition is a separate capability.

### 12.5 Timestamped scene drawing and encoding

Extend the existing shared drawing boundary with a prepared scene plus frame context:

```text
prepareScene(validatedScene, copiedVars, assets)
  → prepared text runs, validated geometry, cached graphic resources, diagnostics
analyzeAudio(decodedAudio, signal)
  → versioned feature table
sampleFeatures(table, timeSeconds)
  → { rms, low, mid, high } in [0, 1]
drawPreparedScene(context, preparedScene,
  { timeSeconds, durationSeconds, features })
  → one complete frame, no I/O or mutation of saved definitions
```

Graphics use a fixed PRNG algorithm seeded during preparation for point/segment coordinates. Subsequent frames derive angle/scale/brightness from **absolute track time**, the saved settings and sampled features. No unseeded `Math.random()`, `Date.now()`, incremental rotation, spring simulation, or accumulation that depends on which frames were drawn before. Seeking directly to 42 seconds must yield the same design as playing there from zero. Use a bounded pure time hash only if a recipe needs changing grain; prefer a stable cached texture initially.

The frame context is ephemeral; no feature values are written back to template/preset data. Resolve text/font runs once per content/style snapshot, not every animated frame. Start by redrawing the bounded scene in z-order; any static cache must preserve that ordering, particularly graphic-under-title. Limit caches to necessary surfaces and reuse them; never retain a canvas/ImageBitmap per output frame.

**Preview:** add an audio-element ref to the existing source `<audio>`. On play, requestAnimationFrame reads `audio.currentTime`, samples the cached table and calls the shared drawing function. Verify the native MP3 timeline against the decoded PCM with start/end transients and gapless/encoder-delay cases; use an explicit tested time mapping if required, not an unexplained magic offset. If a source cannot be mapped reliably, use decoded-buffer playback for that source before claiming synchronized preview. On pause/seek/ended, draw the exact current-time frame once. Cancel animation callbacks on pause/unmount and stop when hidden; resume from media time, not accumulated wall time. Do not update React state every frame. For fidelity checks, preview renders at 1920×1080 internally and CSS scales it, as today. A later low-resolution preview must be explicitly labeled and preserve design coordinates.

**Export:** keep Mediabunny's `CanvasSource`/AAC/fast-start MP4. Add a pre-frame drawing hook to `encodeMp4()` or an equivalent scene callback at the existing frame-loop boundary. For frame `i`, set `t = i / fps`, sample the same features, draw **before** `await videoSource.add(t, min(1 / fps, duration - t))`. Never use rAF or real-time recording for export. Await encoder backpressure, handle final partial-frame duration, and retain the original audio track length. Slow encoding changes wall time, not animation speed.

Derive a validated render profile from the resolved scene, not a hidden global FPS change:

| Profile | Output | Capability check |
| --- | --- | --- |
| Static / explicit still | 1920×1080, 1 fps | Existing settings, plus boundary validation |
| Audio-reactive | 1920×1080, 30 fps | Check the actual 30 fps codec/quality configuration before expensive work |

Reject zero/negative/nonfinite/unsupported FPS at both public render and encoder boundaries. Keep H.264 High/AAC 48 kHz stereo and fast-start requirements. Pin `latencyMode: "quality"` so offline export must not drop frames. The installed Mediabunny supports it, `CanvasSource.add(timestamp, duration)`, `onEncoderConfig` and video/audio `onEncodedPacket`; use the installed `Quality` API rather than its deprecated bitrate fields. Set/verify the actual encoder framerate consistently with capability checks; a successful 1 fps capability probe does not certify 30 fps rendering.

Current 1.8 Mb/s is a **static baseline**, not proof grainy motion will look good. Compare 1.8/3/4.5 Mb/s samples and choose the lowest acceptable animated profile only after actual playback/frame inspection. Do not promise smaller files or faster-than-real-time output. The existing color/YouTube acceptance gaps remain separate; a changed profile must rerun those checks, not inherit a static probe's certification.

### 12.6 Resource ownership, responsiveness and limits

Keep the current one-render-at-a-time model; **do not** start a parallel preview encode. Reuse one prepared track/feature table keyed by File identity plus decode/analysis configuration, not merely filename/size. Text, palette and sensitivity changes reuse analysis; replacing the file invalidates it. On a normal export the job borrows those prepared resources; component replacement/unmount must not close resources until the job releases them.

Decoding remains on the main thread because today's Web Audio decoder is there. It is not truly abortable; after cancel/replacement, invalidate the generation and discard late results. Do not call the UI cancelled and then allow a late decode/analysis to replace the new track. Report decode errors and unsupported audio without clearing a valid saved preset.

Run the bounded analysis pass in a **native module Worker** on demand from the client. Copy and transfer at most one second of channel data per request, with one request in flight and persistent per-channel filter state. Keep the original decoded AudioBuffer for playback/export; **never detach its channel arrays**. A stereo one-second float chunk is about 375 KiB. Terminate on cancel/replacement/unmount, settle pending promises and tag responses with job/generation IDs. Chunking avoids another full-track PCM copy and allows progress/cancel between chunks.

This is a normal bundled Worker, not `next/script strategy="worker"`, Partytown or a service worker. Installed Next.js docs describe dynamic imports/Worker bundling; its `next/script` worker strategy is explicitly unsupported in the App Router. Verify the actual Worker URL/chunk loads under both `next dev` and production `next build`/`next start` before committing to the path. No `next.config` changes or worker dependency are justified without a reproduced bundling need.

Drawing/encoding can initially remain in the current client renderer; bound complexity, respect backpressure, throttle progress and yield to a real browser task at least every 50 ms of CPU work. `await Promise.resolve()` alone does not ensure event/input processing. Measure cancel latency and long tasks. Moving the whole encoder to a worker is a later evidence-driven change because it also changes font/assets/audio ownership; do not claim the analysis worker alone makes all rendering nonblocking.

Provisional launch limits, to verify on the target laptop:

- Animated profile: **5 minutes / 9000 frames at 30 fps**, 1080p, one graphic node, one encode. Preserve today's 15-minute static limit. Make limits profile-specific inputs to decoding/render validation; do not change `MAX_AUDIO_SECONDS` globally or silently trim audio.
- 15-minute stereo decoded PCM alone is **345,600,000 bytes (~330 MiB)**. Five minutes is ~110 MiB. Source bytes, decoder buffers, canvas surfaces, codec queues, mux data and final Blob are additional allocations. The current all-in-memory output is not streaming just because frames are submitted one at a time.
- Before export, estimate output from resolved bitrate/duration, with a documented allowance. At 4.5 Mb/s video + 288 kb/s AAC, five minutes is about 171.2 MiB of payload before overhead, so the 192 MiB payload budget has limited margin. Compare predicted/actual sizes and reject configurations whose allowance exceeds the cap; do not promise every bitrate/duration pair will finish. During video **and audio** encoding, sum packet `byteLength` values; proposed payload guard **192 MiB**, with a further 16 MiB mux allowance. Abort on breach, propagate an actionable error and do not finalize/handoff partial media. Synchronous packet callbacks must signal a tracked job failure/cancellation that the orchestration awaits; do not assume returning a rejected Promise from an encoder callback will be handled by the library. Final Blob size must also pass the combined 208 MiB limit. Packet guards can overshoot by queued output and do not cap browser-process peak memory.
- Keep at most the source AudioBuffer, one feature table, bounded graphic preparation data, one preview canvas and the active export/cache surfaces. Do not decode again for export, keep historical PCM, cache every frame, or copy full PCM into a worker. Pause animated preview while exporting. Account for the existing finished Blob/upload File lifecycle before replacing anything.
- Offer shorter input or explicit still export when limits/capability fail, not automatic 720p, lower FPS, trimmed audio or server processing. Raise the animated duration limit only after 3-/5-minute and repeated-render peak-memory measurements; a 10-/15-minute animated render is not certified by this design.

Cross-studio operation guards need **new coordination**. Today `RenderStudio` does not receive upload `busy`, and its handoff is a bare `onRenderedFile={setFile}`. Add a small explicit parent-owned operation/artifact contract before shipping, so a completed render cannot replace the selected file during upload and an active job cannot be silently lost through preset navigation. Snapshot validated scene/vars/settings, exact File references and prepared analysis at job start. Preserve/confirm replacement of finished artifacts, disable conflicting replacements, and guard internal navigation as well as browser unload. This closes relevant existing audit defects instead of assuming those protections already exist.

### 12.7 Smallest coherent integration sequence

Do not wait for the entire reference-video wizard or local library before proving motion. Deliver a single source-controlled Orbital preset end to end, then expose reusable customization through the same composition system.

| Existing / planned path | Narrow responsibility |
| --- | --- |
| `lib/renderer/template-schema.ts` | Strict version dispatch, graphic/metadata layers, profile/bounds validation; preserve v1 input compatibility |
| `lib/renderer/audio.ts` | Reusable decoded-track preparation and profile-specific duration limits; never hidden duplicate decoding |
| `lib/renderer/audio-features.ts` (new) | Versioned filters/envelopes and deterministic sampling; pure numeric core testable in Node |
| `lib/renderer/audio-analysis.worker.ts` (new) | Bounded chunk protocol/progress/cancel; no React/DOM/auth or retained full-track copy |
| `lib/renderer/graphics.ts` (new) | One registered orbital recipe, seeded preparation, bounded Canvas drawing; no general plugin system |
| `lib/renderer/scene.ts` | Shared prepared text/graphic dispatch with explicit frame context |
| `lib/renderer/encode.ts` | Validated profile, frame callback before capture, backpressure, packet budget and cleanup |
| `lib/renderer/capabilities.ts` | Probe selected dimensions/FPS/quality rather than a hard-coded static-only check |
| `lib/renderer/index.ts` | Job snapshot, prepare/analyze/render stages and resource lifetime; retain existing v1 render entry compatibility |
| `lib/templates/compile.ts`, `authoring-schema.ts` | Versioned data → concrete scene; pure, no audio analysis/storage/network |
| `lib/templates/index.ts`, new `orbital.ts` | Append built-in preset without changing `first-light`/`pulse`/`grid` IDs/default |
| `components/render-studio.tsx` | Conditional controls, source-audio clock, analysis state, stale-result protection and explicit still option |
| `app/(app)/generate/page.tsx` | Parent-owned operation guard/artifact handoff; uploader API itself stays unchanged |
| `lib/templates/store.ts` (planned) | Saved v1/v2 definitions/settings/assets committed transactionally; no audio/analysis persistence |

Order:

1. **Safety and still-frame foundation:** runtime snapshot/profile validation, bounded text/images, shared prepared scene. Fix the concrete renderer's known title-fit/boundary defects; preserve legacy definitions and public entry points.
2. **One complete animated vertical slice:** deterministic features/Worker, one graphic renderer, selected-profile capability check, per-frame export and actual synchronized preview. Do not present a static Orbital mock as completion of the confirmed audio-reactive requirement.
3. **Studio integration/lifecycle:** content/appearance/motion controls, optional image support, operation locks, stale-artifact checks, navigation/cancel/cleanup and failure messages. Keep the existing `Blob → File → Use for upload` contract and direct browser-to-YouTube transport.
4. **Reuse:** save/duplicate Orbital definitions/seed/settings through versioned local storage and portable backups, using the same compiler as image/text presets. Then add more recipes only when needed; references remain optional guides.
5. **Acceptance gate:** real UI/MP4 correctness and representative device/resource/quality checks below. No auth service, API route for rendering, database server, Three.js, animation library or new media dependency is needed.

### 12.8 Verification specific to approach 2

In addition to section 10:

- **Numeric Node tests:** silence produces zero energy/no NaN; known low/mid/high tones activate the expected band; opposite-phase stereo does not disappear; impulses, quiet tracks, clipping and final partial hops behave as specified. Chunked/whole-input analysis agrees within tolerance. Test smoothing response, fixed timeline and out-of-range time clamping.
- **Schema/compiler tests:** unknown generator/revision, oversized counts, invalid seeds, nonfinite motion, surplus/missing settings, duplicate metadata fields and incompatible image mode fail before decoding. Seed/settings/theme round-trip; palette changes do not move boxes or reseed; old static package versions retain their meaning.
- **Determinism:** the same snapshot/seed/feature time produces identical drawing commands for direct seek, forward playback, reverse seeks and export. Changing preview schedule must not change the animation. A different seed changes structure, not text geometry. Motion disabled freezes both rotation and response.
- **Actual studio UI in production Chrome/Edge:** select Orbital without an image, add a real decodable track, play/pause/seek, edit metadata/text/palette/reactivity, save/reload/duplicate, replace audio during analysis and cancel at each stage. Check worker readiness/errors and zero PCM/reference uploads. Run both solid and optional-image variants; no fabricated pitch labels or social controls in output.
- **Actual exported MP4:** draw visibly different expected timestamps, download through the UI, inspect frame count/timestamps/final duration, decode representative frames and compare to same-time preview within documented codec/color tolerance. Confirm nonzero video/audio tracks, selected FPS, AAC, front moov and acceptable transient synchronization. Static 1 fps regressions remain green. Build success or a changing preview alone is not this test.
- **Quality/resource gate:** representative music plus synthetic transients at 30 seconds, 3 minutes and 5 minutes; compare bitrate candidates, wall/CPU time, UI long tasks/cancel latency, file size and browser-process peak memory. Five consecutive render/discard cycles must release Worker/bitmap/URL/PCM/feature/job resources without monotonic retention. Exercise packet-budget overflow and storage/worker/codec failures without handing off a partial file. Report measured hardware/results, not a speculative performance claim.
- **Publishing/lifecycle:** active upload blocks source replacement/handoff; navigation and replacement require appropriate confirmation; stale analysis cannot mutate a newer draft; downloaded artifacts remain unaffected. Test the existing upload flow with mocked boundaries first; deployed-origin Google/YouTube acceptance is still a separate authorized gate.

**Design conclusion:** add a bounded procedural graphic capability to the existing shared renderer, not a second rendering engine. The unavoidable change is from “draw once, capture repeatedly” to “draw deterministically at each media timestamp.” Keep static costs static, analyze each track once, and make the new motion profile explicit. No application code or performance certification is delivered by this document.

### Initial design-only verification — 18 October 2026

- Compiled both TypeScript contract blocks together in memory using the installed TypeScript with strict checking. Both JSON fixtures parsed and satisfied their corresponding proposed types.
- Checked fixture reference identity, layer IDs/bounds, text-box separation, graphic settings bounds, all six proposed Orbital boxes and the resource arithmetic. These are documentation checks, not an implemented Zod validator or measured font fit.
- Existing focused renderer tests: **8/8 passed**, no failures/skips. Project `npx tsc --noEmit --incremental false`: passed.
- Reviewed the installed Mediabunny callbacks/frame capture and relevant installed Next.js lazy-loading/Worker documentation. No dependencies/configuration/application files changed. The pre-existing `docs/findings.md` edit was left untouched.
- At that initial documentation checkpoint, no graphic UI, Worker, animated MP4, performance benchmark or visual-fidelity test was run. Later asset/prototype work and its separate scope are recorded below; this historical checkpoint does not certify that later work.

## 13. Adversarial review — challenge this plan before implementation

The reference can inspire a strong graphic without requiring the complete system above immediately. Treat this section as a correction to implementation priority, not authorization to build every planned subsystem in one change.

| Challenge | Failure if ignored | Decision / proof required |
| --- | --- | --- |
| Too many systems in the first slice | Compiler, editor, Worker, storage and migration land together; failures cannot be isolated | First prove **one source-controlled Orbital scene + synchronized audio + real MP4**. Custom-library and reference-importer UI follow separately. Do not build a general recipe/plugin engine. |
| Generated fog vs exact reference | Procedural fog may look synthetic; a static screenshot cannot specify original motion | Use the image pack/prototype for owner visual review. Record differences. No exact-reconstruction claim or recovered musical-note claim. |
| Native MP3 clock vs decoded PCM | Encoder delay/gapless trimming causes animation/preview offset | Use transient fixtures including leading silence/MP3 delay. Compare event times at start/middle/end; fix the common timeline or use decoded-buffer playback. A constant assumed offset is not proof. |
| 1080p grain at 30 fps | Static 1.8 Mb/s blurs texture; raising bitrate hits memory/size guards | Inspect actual decoded moving frames at three candidate bitrates; measure size/time/peak memory on named hardware. Use stable sparse texture rather than new full-frame random noise every frame. |
| Five-minute cap is not decoder memory protection | `decodeAudioData` may allocate the whole over-limit track before duration rejection | Check container metadata where reliable, centralize an explicit source-byte cap before reading, reject obviously excessive inputs and document decoder-allocation uncertainty. Do not present the duration check as a hard process-memory guarantee. |
| Format/schema proliferation | Authoring-v1/v2 and concrete scene-v1/v2 are confused; fields silently disappear | Name versions in tests explicitly. Reject unknown keys/versions. Current renderer schema is only v1. No new version is implemented by the design examples. |
| Premature Worker architecture | Building an entire rendering Worker adds font/PCM transfer complexity before profiling | Analysis Worker is bounded and cancellable. Prove dev/production Worker loading first. Keep renderer move separate unless measured long tasks require it. |
| Prototype mistaken for implementation | Synthetic motion or a flattened PNG is called audio-reactive rendering | Prototype must display its simulation warning and have no fake MP4/preset-save actions. Production acceptance requires real track analysis and a downloaded MP4 through the app. |
| Image assets treated as dynamic graphics | Rings baked into a background duplicate the later generated rings; title becomes uneditable | Use only the three text-free backgrounds as backgrounds. Concept images are review-only; alpha tiles are future resources, not a required replacement for procedural generation. |
| Existing ownership defects multiply | Render completion replaces an in-flight upload; old async results overwrite new audio | Parent-owned operation/artifact identity and generation tokens are safety gates. No feature work is accepted while these required lifecycle tests are failing. |

**Scope checkpoint:** image pack and visual prototype are independently deliverable now. A single production animated preset is the next coherent implementation. Saved custom templates, reference capture and additional recipes are later deliverables, not hidden prerequisites for that first preset. Retain existing public APIs and built-in picker IDs; only an explicit, reviewed change may widen them.

## 14. Executor runbook — follow these gates in order

This is a checklist for a later executor agent and its reviewer. A checkbox is a requirement, **not a claim it already passed**. The current asset/prototype is not an implementation of sections 5–12.

### Gate 0 — establish scope before editing

- [ ] Read `AGENTS.md`, this document and `docs/findings.md`; inspect `git status --short`. Record baseline commit, pre-existing edits and exact files authorized for the slice. Do not overwrite prior documentation or baseline media.
- [ ] Read the relevant **installed** Next.js guide before Next/React changes. Use installed Mediabunny types/source for encode callbacks; do not rely on remembered APIs.
- [ ] State acceptance in writing: input/output paths, exact version/interface changes, dimensions/FPS/codecs, optional-background behavior, duration/byte budgets, files that must remain unchanged and checks to run.
- [ ] Implement one gate/slice at a time. No publishing, real Google upload, production deployment or new external service is implied. No runtime dependencies are required by the asset/prototype task.

### Gate 1 — generated assets and visual prototype (present artifacts)

Exact paths:

```text
public/images/orbital/background-monochrome.jpg   1920×1080, opaque, text-free
public/images/orbital/background-obsidian.jpg     1920×1080, opaque, text-free
public/images/orbital/background-umber.jpg        1920×1080, opaque, text-free
public/images/orbital/grain-alpha.png              256×256, transparent white grain
public/images/orbital/stipple-alpha.png            256×256, transparent white stipple
public/images/orbital/orbital-preview.png          1920×1080, flattened static SAMPLE design
public/images/orbital/orbital-thumbnail.jpg        320×180, flattened SAMPLE thumbnail
public/images/orbital/asset-sheet.jpg              1600×1370, labeled review overview
public/images/orbital/manifest.json               dimensions, roles, sizes, SHA-256
public/prototypes/orbital/index.html              isolated visual prototype
public/prototypes/orbital/prototype.mjs           seeded, simulated timestamp drawing
```

- [ ] Run `node tools/generate-orbital-images.mjs --verify-only`; expect eight images, exact manifest sizes/hashes, browser-native decoding, real `decodeImageFile()` compatibility, transparent texture pixels, opaque backgrounds and zero external HTTP requests. A decode pass does **not** prove visual quality or absence of baked-in words; inspect the artwork too.
- [ ] Regenerate intentionally with `node tools/generate-orbital-images.mjs`; never edit generated image bytes manually. Chrome is required; set `CHROME_PATH` if not on macOS. Record browser version. PNG/JPEG byte determinism is only expected in the same browser/encoder environment.
- [ ] Open `/prototypes/orbital/` on a local server rooted at `public` or the app origin. Confirm all image/font requests are local 200s, no console/page errors, and layout fits desktop and 390 px width with no horizontal overflow.
- [ ] Change title/message/background/ring count/sensitivity; shuffle; seek to 0 and 7.5 s; play, pause, reset. Check same seed/time redraws identically. Check changed seed/time actually changes pixels. No auto-play, including reduced-motion preference.
- [ ] Click **Download current PNG**. Confirm a real 1920×1080 PNG download, not just a success message. The prototype uses one-line shrink/clip, **not** the production bounded multi-line typography contract; test long text in the future production renderer independently.
- [ ] Verify the copied JetBrains Mono font is accompanied by its existing OFL license. Keep sample lettering/metadata limited to concepts/prototype, never the reusable background files.

### Gate 2 — production contract / safety foundation (future)

- [ ] Preserve static caller compatibility and `first-light`/`pulse`/`grid` IDs/default order. Add strict version dispatch, finite numeric bounds and snapshot before any await; test unknown version/keys/generator/count and mutation-after-start failures.
- [ ] Add actual-font bounded text tests: short, long, unbroken, Unicode; assert glyph bounds horizontally **and vertically**. Existing fake-measure tests alone do not close F07.
- [ ] Define one scene/job resource owner; prove no duplicate decode, detached AudioBuffer channel arrays or stale async overwrite. Missing required assets block; solid scenes do not require a dummy image.
- [ ] Add regressions before claiming a fix. Run the relevant tests, project typecheck and lint after final edits; no suppression, skipped assertion or swallowed exception to pass.

### Gate 3 — actual audio-reactive slice (future)

- [ ] Freeze analysis coefficients, smoothing, timeline and numeric tolerance in code/tests. Test silence, anti-phase stereo, band tones, impulses, clipping, quiet tracks and final partial hops. Compare chunk sizes to whole-input reference.
- [ ] Verify native Worker in both dev and production. Corrupt/unsupported audio, Worker error, replacement and cancellation settle promises, release resources and cannot update a newer selection.
- [ ] Preview uses actual source media time and the same feature sampler as export. The prototype's synthetic sine energy is **not reusable evidence**. Draw before capture, await backpressure, no rAF-driven export or dropped output frames.
- [ ] Invalid FPS rejects before expensive work at both boundaries. Check actual selected encode configuration, 30 fps output track, monotonic timestamps, final partial duration and AAC track. Do not infer motion from a nonempty `.mp4`.
- [ ] Exercise cancel during decode/analysis/assets/video/audio/finalize and packet-budget failure. No late success/handoff or partial file. Async encoder callbacks need an observed tracked error path; unhandled rejections are a failure.
- [ ] Production app: choose Orbital without an image, load real audio, edit text/palette, seek/play, render, download and use for upload. Mock Google boundaries only. Verify upload cannot receive a replacement during an active job and internal navigation requires confirmation.

### Gate 4 — persistence and wider catalog (future, separate slice)

- [ ] Wait for transaction **complete**, not request success. Inject abort after request success. Save must reject, previous preset survive and no dangling asset rows remain.
- [ ] Reload/duplicate/change background; edits must not mutate shared immutable references. Versioned JSON backup/import round-trip remaps IDs on collision and rejects unknown/oversized/script/remote URL data without changing storage.
- [ ] Do not save audio/PCM/feature arrays/release title into presets. An invalid schema/failed save must preserve the editable draft and accurately show unsaved state.

### Gate 5 — final checks and reviewer handoff

Run from the repository root, retaining exit status; do not pipe through `tail`/`grep` without `set -o pipefail`:

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
node tools/generate-orbital-images.mjs --verify-only
node tools/generate-orbital-images.mjs --check-prototype
# Optional baseline codec check; keep historical media/report untouched:
M0_OUTPUT_DIR="$(mktemp -d /tmp/beatflow-m0-review.XXXXXX)" npm run m0:probe
```

- [ ] Start `npm run start -- --hostname 127.0.0.1 --port 3128` as a managed background service; wait for readiness and inspect logs. Test **production** UI, not just the dev server. Do not overwrite a running unrelated process. Stop only processes created for this task.
- [ ] For production animation, collect 30 s / 3 min / 5 min runs and five repeated render/discard cycles on named hardware. Return wall time, CPU/peak process memory, long tasks/cancel latency, bitrate, file size, frame count and playback results. Missing measurements stay **NOT RUN**, not “low memory.”
- [ ] Return a review packet: baseline/final commit (if any), changed paths, exact commands/exit statuses, regression names, browser/OS/hardware, screenshots, downloaded artifact paths/SHA-256 and media inspection, network/error logs, limits/blockers and cleanup confirmation. Include the negative failure-case results, not only a happy-path screenshot.

**Stop and report instead of improvising** if versions/paths are ambiguous, installed Worker/API behavior differs, output is audio-only, same-time pixels differ by seek history, a write is reported saved before commit, an old job mutates a new one, limits are exceeded, or a required check fails. Fix/retest the affected cause or report it blocked. Do not widen scope, remove validation, silently lower FPS/resolution or manufacture external acceptance.

Reviewer acceptance means reviewing both the diff **and returned artifacts** against this runbook. A build, a static prototype, a schema fixture or a green old test suite alone cannot approve production audio-reactive rendering.

## 15. Asset/prototype delivery verification — 18 October 2026

Delivered original procedural artwork under `public/images/orbital/` and an isolated interactive study under `public/prototypes/orbital/`. Generation uses native Canvas in a temporary local Chrome, not an external image service. `README.md` and `manifest.json` distinguish clean backgrounds/alpha resources from flattened SAMPLE concepts. No existing application/auth/uploader/renderer source or package configuration changed.

Measured/verified in Chrome **155.0.8059.80**:

- Eight assets: **4,604,335 bytes total**; manifest hashes, PNG/JPEG signatures, dimensions and existing `decodeImageFile()` compatibility pass. Three opaque 1920×1080 backgrounds; two genuinely transparent 256×256 tiles. No external page HTTP requests.
- Prototype: text/message, all backgrounds, ring count, sensitivity, shuffle, deterministic seeks, play/pause/reset and no autoplay pass. Desktop 1440 px and mobile 390 px have no horizontal overflow; reduced-motion mode stays paused. This is simulated motion, not decoded-audio energy.
- Real PNG download: 1920×1080, **2,070,954 bytes**, SHA-256 `af202b290a19bb95a62af61cb460a4cec6dd839644482de2520c7eb6360ad9db`; retained as `public/prototypes/orbital/downloaded-prototype.png`. Screenshots and `verification.json` are beside it. Re-run `--check-prototype` to refresh evidence.
- During verification, bulk image-data return through CDP timed out. Saving generated blobs to the task-local server removed the failure. Playback testing also exposed a first-frame timestamp/slider rounding issue; playback now uses its own accumulator and initializes its clock from the first animation frame. The affected browser assertions pass after the repair.
- Project suite **51/51 passed**, zero failures/skips; full lint, project TypeScript and production build passed. Final modified generator/prototype JavaScript also passed focused lint and the browser check again.

These checks do not close production audit findings or certify media export, analysis Worker, track synchronization, storage, bitrate quality, peak memory, Edge or physical devices. Automated pixel checks and screenshots are not an independent aesthetic approval; owner visual review remains open. No new M0 media probe or real Google operation was necessary/performed for this asset-only/prototype change. The local preview can be started with `node tools/generate-orbital-images.mjs --serve`; it serves on loopback port 3136 and contains no auth/session/backend access.

## 16. Production Orbital slice — verification (18 October 2026)

Sections 12.1–12.5 are implemented as one client-side slice: the `Orbital` preset and its
`buildOrbitalTemplate()` image variant, schema v2 with a validated `graphic` layer, the pure
feature analyzer plus its bundled Worker, `resolveRenderProfile()`, the per-frame encode hook
and the studio's reactive preview. Section 12.2's persistence (save preset / save as new) and
explicit still export are **not** implemented, so gates 0 and 4 are untouched.

Measured, not inferred:

- `npm test` **106/106**; `npx tsc --noEmit --incremental false`, `eslint` and `next build`
  clean. New tests cover schema rejection (unknown generator, two graphics, out-of-range
  settings), settings clamping, deterministic seeded drawing, motion-off freezing, conditional
  metadata, the explicit image variant, the profile rules and picker order, plus the analyzer's
  silence floor, band selectivity, opposite-phase stereo, clipping, attack/release, chunk
  equivalence, partial hop and interpolation.
- `npm run motion:check` (Chrome 155.0.8059.80, production build, synthetic owner session):
  7/7. A still design preview with no fake motion; module-Worker analysis unlocks the render;
  the paused preview reacts to energy (hash 2660247814 quiet vs 2976253781 loud) and seeks back
  to the same frame; the downloaded MP4 is 885,363 bytes, decodes to 180 packets at 30.00 fps
  over 6 s with H.264 + AAC, quiet and loud exports differ, `colr` and SPS VUI are both
  limited-range BT.709; cancelling during video encoding returns to `cancelled` with no
  downloadable artifact.
- `MEMORY_PROFILE=orbital MEMORY_MODE=quick npm run memory:check` on the 8 GB 2013 MacBook Air
  target (1536 MiB renderer budget): 30 s beat → **906 MiB** peak renderer / 1337 MiB whole
  tree, **84.7 s**; five 30 s render/discard cycles peaked at 893, 817, 853, 873, 881 MiB with
  retained readings 510, 486, 490, 492, 493 MiB (−17 MiB first to last).
- `npm run text:check` covers Orbital's title and producer bands with a 115-character title
  (its metadata and message bands are covered by the Node scene tests); `upload:check` and
  `a11y:check` still pass after the fourth preset was added to the picker.

Still open against this document, and deliberately not claimed:

- The gate 5 production-animation matrix needs 30 s **and 3 min and 5 min** runs on named
  hardware; only 30 s was measured for the animated profile, so the 5-minute / 9000-frame case
  is unmeasured. Encoder wall time is about 2.8× real time for the 30 s sample, so it is not
  real-time.
- The 192 MiB packet budget, the 16 MiB mux allowance and the final-Blob check are implemented
  but no test drives a job over the cap; cancellation is proven during video encoding, not
  during decode, analysis, assets, audio or finalize.
- 3 Mbps is a provisional animated bitrate. The 1.8 / 3 / 4.5 Mbps visual comparison and the
  owner's review are still required before calling it the final profile.
- The preview samples features by the media element's `currentTime`; no encoder-delay or
  gapless offset against the decoded PCM has been measured, and there is no decoded-buffer
  preview fallback if a source cannot be mapped.
- No saved presets, preset library, import/export, still export, reduced-motion default or
  reference-capture workflow ships with this slice, and the deployed-origin and real-device
  passes remain open.
