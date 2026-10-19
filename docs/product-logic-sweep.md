# BeatFlow — independent product and logic sweep

Review date: 19 October 2026. Application baseline: `baa44bb`.

## Method and verdict

The owner's pasted requirements and attached three-panel editor mockup are the acceptance
criteria. Existing project docs, milestones, prior reports, prototype screenshots, and old
benchmark results are **not evidence for this assessment**. Findings below come from current
application source, the installed dependencies, fresh automated checks, and fresh Chrome runs
against a newly built production application. Comments were checked against executable logic.

**Verdict: a useful preset renderer and owner-only publishing desk exist; the requested reusable
Template Studio and batch automation product do not yet exist.** The rendering foundation is
compatible with that direction, but calling the whole spec implemented or nearly finished
would be misleading. Static rendering and one specific animated preset work. General animated
templates with editable timelines, transitions, and moving layers are missing.

This was an audit, not authorization to implement all missing features. No application source,
dependency, credential, deployment, or real YouTube content was changed. The only intended
repository changes are this report and the review section of `docs/task_plan.md`.

### What exists today

- Four bundled presets: First Light, Pulse, Grid, Orbital (`lib/templates/index.ts:19–43`).
- Static Canvas composition; template-specified text, rectangles and image bindings.
- Orbital's seeded rings/particles, rotation and energy-driven pulse; a few appearance controls.
- Source-audio playback and seekable reactive preview; browser MP4 export and download.
- Explicit render-to-upload handoff and separately editable YouTube metadata/schedule.
- Owner-gated Google integration, same-session resumable transfer, status refresh, local receipts.

### What the screenshot requires but the current screen does not provide

`components/render-studio.tsx:570–1020` is a preview with a preset/input/settings panel, not an
Elements / Canvas / Properties editor. The canvas has no selection, pointer editing, resizing,
rotation, or layer controls (`:594–601`). A fresh browser inspection found four preset radios,
a single-file audio input (`multiple=false`), no template links, and no canvas interaction props.
There is no `/templates` or editor route; the fresh build exposes `/`, `/generate`, `/history`,
`/settings`, auth, and four YouTube endpoints.

## Requirement-by-requirement coverage

**Working** means an exposed implementation exists; it does not imply a complete production
acceptance run. **Foundation** means renderer/schema support without the requested user workflow.

| Requirement | Current status | Evidence / gap |
|---|---|---|
| Choose a preset | Working | Four presets, native-radio picker; `lib/templates/index.ts`, `components/render-studio.tsx:715–761`. Design quality still needs owner approval. |
| Customize an existing template | Very partial | Change source artwork/title; Orbital exposes rings, particles, tilt, seed and motion. No editable typography, colors, layout, or saved variant. |
| Create from a blank canvas | Missing | No authoring document, blank-canvas action, element insertion, or editor route. A schema accepting an empty layers array is not a UI feature. |
| Save once and reuse a personal template | Missing | Presets are source constants; UI edits are component state. No user template repository/save action. |
| Three-panel editor | Missing | Preview and input panel only; no Elements/Layers/Properties workspace. |
| Click, drag, resize, rotate, change font | Missing | Canvas is display-only. Text positions/fonts exist in source, not editable controls. |
| Undo/redo, design shortcuts, snapping | Missing | No command history, selection model, transform tools, or guide engine. Normal browser form keyboard access is not editor keyboard support. |
| Layer order, locks, visibility, groups | Foundation / missing UI | Array order controls draw order. No stable node IDs, group, lock/hide, or reorder controls in the scene contracts. |
| Align/distribute | Missing | Fixed preset coordinates only. |
| Actual-title/artwork preview before export | Working with defects | Shared scene drawing path and live source preview; title/state mismatches described below. |
| Batch: select many beats | Missing | UI reads `files?.[0]`; no multiple selection/track list. |
| Apply one template to every beat | Missing | No batch job model, queue, default assignment, or scheduler. |
| Per-track template overrides | Missing | No batch track records to override. |
| Queue keeps a template snapshot | Foundation only | `snapshotRenderInput()` copies template/variables at render invocation. No durable queued job or persisted asset binding. |
| Browser can close after completed upload and scheduling | Correct architectural boundary | Schedule is included in YouTube initialization. There is no browser timer needed afterward. Actual remote publication remains unverified in this audit. |
| Browser can close during rendering/upload and resume | Missing | Browser owns media/transfer; only completed receipts persist. Navigation warnings are not recovery. |
| Multiple independent users | Missing, if intended by “users” | Google sign-in explicitly rejects everyone except `OWNER_EMAIL`; `auth.config.ts:36–37`, `lib/owner.ts`, `lib/require-owner.ts`. Current behavior is intentional owner-only, not multi-tenant. |

### Dynamic variables

`lib/renderer/template-schema.ts:253–287` defines the seven requested names plus `message_text`.
Interpolation happens inside text layers; missing/unknown values become empty strings. It is
not a variable-insertion UI, metadata extraction service, or template validation for spelling errors.

| Variable | Renderer boundary | Actual studio / preset behavior |
|---|---|---|
| `{{track_name}}` | Supported | Filename-derived editable title, present in every preset. Cross-track edit leakage exists. |
| `{{filename}}` | Supported and supplied | Original selected name supplied; no bundled text layer uses it and users cannot add one. |
| `{{producer_name}}` | Supported and supplied | Comes from producer settings; presets display it. |
| `{{bpm}}` | Supported and supplied | Optional manual 20–300 value, UI and conditional display in Orbital only. Not read from MP3 tags or inferred. |
| `{{key}}` | Supported and supplied | Optional manual musical-key selection, Orbital only. Not read from MP3 tags or inferred. |
| `{{year}}` | Type/interpolation foundation only | Studio never supplies it; no current-year default or insertion control. |
| `{{purchase_url}}` | Type/interpolation foundation only | No purchase-link setting/input or supplied value. |

Studio variable construction is in `components/render-studio.tsx:319–331,511–519`.
BPM/key controls are at `:811–843`; absent values hide the relevant Orbital layers rather than
inventing metadata. Audio analysis measures RMS/band energy, **not tempo or pitch**
(`lib/renderer/audio-features.ts:16–58,160–217`). That distinction is correct.

### All six customization categories

| Category | Implemented foundation | Missing from the requested product |
|---|---|---|
| A. Backgrounds | One uploaded image, cover/contain and normalized crop offsets in schema; solid canvas color; rectangle scrims. | No color/gradient picker, image blur/brightness/contrast, crop/reposition controls, pan/zoom animation, or saved artwork bindings. |
| B. Typography | Two font families, size/weight/spacing, alignment, uppercase, shadow, outline, bounded wrap/shrink in renderer. | No user font/type controls, draggable text boxes, text insertion, or variable insertion. Preset values are fixed in code. |
| C. Elements | Text, rectangles, one background image binding, logo binding in low-level assets, one Orbital graphic recipe. | No element toolbox, arbitrary additional images, positioned/scaled logos, generic lines/shapes, waveform or video progress bar. Upload-progress UI is not a rendered progress bar. |
| D. Animation | Orbital rotation/pulse/emphasis at 30 fps, deterministic seeking. | No timeline, keyframes, clips, fades, transitions, text movement, background pan/zoom, generic animated properties, or waveform node. |
| E. Layout | Renderer draws preset coordinates in array order. | No direct manipulation, generic transform model, layer IDs, reorder/lock/hide/group, snapping, alignment, distribution. |
| F. Branding | Producer name saved locally. | No saved logos, default typography, palette, branding presets, master template, or inherited overrides. |

Image layer support is narrower than it first appears: `lib/renderer/template-schema.ts:27–37`
has no per-image box or rotation, and `lib/renderer/scene.ts:182–207` fits every image to the
whole canvas. Although low-level asset helpers accept a logo, `RenderInput` and `renderVideo`
only expose/pass a background (`lib/renderer/index.ts:117–123,208–210`); a logo-bound scene
cannot complete the normal export path. Treat logos as unfinished plumbing, not a shipped feature.

### Template management and inheritance

Every requested My Templates action is missing: create, edit saved design, thumbnail/date,
duplicate, rename, default, delete, import/export configuration, and personal library browsing.
No template store/API exists. Download MP4 is not Export Template. `DEFAULT_TEMPLATE_ID` is a
constant selecting the first bundled preset, not a saved user preference.

Inheritance is also missing: neither scene version has a parent reference, branding reference,
merge/override policy, revision history, cycle handling, or propagation logic. Changing producer
settings affects the next mounted studio's name, not an inheritance graph. Already-running
renders copy scene data, but no queued job exists to retain an immutable resolved template.

**Good foundation to retain:** `lib/renderer/template-schema.ts` is data-only Zod/TypeScript,
not React or Konva serialization. Keep a versioned, editor-independent authoring document and
compile it into the rendering scene; do not mistake the current limited scene format for a
complete future editor format. Migrations must preserve v1/v2 presets and reproducibility.

## Confirmed logic findings

### P1 — a track change can export the previous track's audio

**Reproduced in production Chrome, twice, with a controlled slow-decode window.**

- Selected/fully analyzed Old Audio.wav (6 s), then selected New Audio.wav (2 s).
- A DOM observer saw the new source label while the render control was still enabled and
  clicked it before the new analysis state committed.
- Held the new file's `decodeAudioData` promise to simulate a slower decode.
- A completed MP4 appeared **before releasing that decode**, with media duration **6.08 s**,
  from the previous 6-second track instead of the selected 2-second track.

`selectAudioFile()` changes file/URL without synchronously invalidating analysis, decoded audio,
or features (`components/render-studio.tsx:362–376`). The analysis effect marks analyzing only
**after** an awaited import (`:261–285`), leaving a stale-ready render window. Export passes
`decodedRef`/`featuresRef` (`:520–525`), and `renderVideo` trusts the reused decoded buffer
instead of proving it belongs to `input.audio` (`lib/renderer/index.ts:181`). Feature validation
only compares the table to that old buffer's duration (`:240–247`), so both stale objects pass.

**Required repair:** identify each selected source and bind decode/features/readiness to that
identity; invalidate them synchronously on selection; reject mismatched cached data at the
renderer boundary. Regression must force delayed/reordered decode completion and verify the
exported audio/duration for the selected source, including equal-duration different tracks.
The controlled click proves a real state inconsistency; it does not establish its frequency
for ordinary human clicks.

### P1 — per-track content leaks into the next beat

**Edited title reproduced in Chrome.** Choose First Beat, edit its title to Custom First Beat,
then choose Second Beat: file changes, but displayed/rendered title remains Custom First Beat.
`trackNameTouchedRef` resets only when the file is cleared, not when it is replaced
(`components/render-studio.tsx:166,362–376,805–806`). That contradicts automatic metadata
replacement across beats. BPM/key/message are also shared component state with no per-track
record/reset rule (`:153–155`); whether to reuse the promotional message should be explicit.

The YouTube title has a similar lifetime-wide touched flag (`app/(app)/generate/page.tsx:158,
227–233,604–605`). Preserving an edit for the *same release* is useful, but there is no new-release
boundary to stop carrying it into unrelated audio. Manual MP4 selection does not derive any
title at all (`:300,315`). Fix source identity and metadata ownership together, not one flag alone.

### P2 — repeated storage failures discard earlier fallback receipts

**Reproduced directly through `addHistoryEntry()`/`readHistory()` with denied IndexedDB.**

1. Add receipt A: returns non-durable, A remains visible in memory.
2. Add receipt B while durable storage is still denied: returns non-durable.
3. Read history: only B remains. A has disappeared from the session fallback.

When a durable retry fails, `lib/history.ts:110–121` creates a new empty memory controller and
adds only the newest receipt, dropping previous fallback rows. Durable database rows are not
deleted by this path, but receipts that only existed in memory are lost. Preserve and merge
existing fallback rows when retrying or failing again. Current tests cover one fallback write,
not consecutive failures. Also, failed reads return `[]` without a visible storage error
(`:80–89`), which makes unavailable history look empty.

### P2 — a verified private unscheduled video is mislabeled “Unlisted”

**Reproduced via `historyStatus()`** with `privacyStatus='private'`, `publishAt=null`, a check
timestamp and successful upload state. Result is `unlisted` because of
`lib/history.ts:147`. History UI maps that to “Unlisted”, even though its separate privacy
field says private (`app/(app)/history/page.tsx:61–68`). Add an explicit private state and
handle incomplete/missing/deleted remote states without inventing visibility.

### P2 — completed releases can be accidentally uploaded again

**Reproduced in Chrome with entirely mocked upload endpoints:** after a successful first
upload, pressing Start upload again with the same file/title created a second independent
session/video ID without confirmation. No real YouTube upload occurred.

`startUpload()` prevents overlap, but after success clears busy state and leaves the source
selected; the next click clears the prior result and initializes another session
(`lib/use-upload-job.ts:92–129,173–210`, submit button at
`app/(app)/generate/page.tsx:769–774`). There is no completed-job identity or duplicate warning.
An ambiguous-outcome retry can likewise start a fresh upload, losing the old recovery context.
Add explicit New release / Retry existing session semantics and confirmation before a fresh
session for a completed or ambiguous job. This is duplicate-prevention UX/state, not proof
that YouTube offers an idempotency key for this operation.

### P2 — preview and export can disagree about an empty title

**Source-confirmed, not separately browser-reproduced.** Clearing the title previews the literal
“Track title” (`components/render-studio.tsx:323`), but export falls back to the filename
(`:502`). Whitespace-only titles can disappear in preview while export still uses the filename.
Use one resolver and one bound-variable snapshot for both paths. Current long-text tests prove
wrapping for supplied strings, not agreement of UI fallbacks.

### Reliability/product limitations established from source

- Rendered files, chosen input files, current metadata, template edits and resumable URIs are
  not persisted. IndexedDB stores at most 50 completed upload receipts
  (`lib/history-store.ts:7–23,165–169`). Refresh/reconnect cannot resume an active job.
- Idle finished renders are not navigation-protected: warnings are enabled only while rendering
  (`components/render-studio.tsx:564–568`). Going to Settings can lose an undownloaded MP4 and
  draft controls. Settings are not a durable project save.
- Default schedule is page-mount time +10 minutes (`lib/time.ts:110–112`), not upload-ready
  time. A slow render/wait can make it stale. Submission safely rejects past values; it does
  not silently renew the schedule. No performance measurement is needed to establish that
  workflow issue, and no old render timing was used here.
- A schedule future at initialization may elapse during transfer/remote processing. There is
  no job-aware margin policy, automatic rescheduling, or immediate post-upload status gate.
  Never equate “upload returned an ID” with “publication completed.”
- Normal upload success records requested privacy/schedule, not a verified returned status;
  History's manual refresh is the actual status read. Recovered uploads correctly start as
  unverified rather than borrowing intended visibility (`lib/use-upload-job.ts:173–187,267–290`).
- Recovery scans only the latest 25 upload-playlist items with no pagination
  (`app/api/youtube/latest-upload/route.ts:72`). That is insufficient for large batch histories.
- A final 200/201 response with unreadable/missing video ID throws a generic UploadError,
  not UploadOutcomeUnknownError (`lib/youtube/uploader.ts:146–152`). The text warns to check
  Studio, but the in-app candidate-recovery action is only enabled for the latter class.
- Audio decode is whole-track and not abortable; its signal is checked after decode. Encoding
  and color conversion run on the main thread, analysis alone uses a Worker. A bounded chunk
  size for analysis messages is not a measured peak-memory guarantee or worker backpressure.
- Turning Orbital motion off does not select the efficient static profile: any v2 graphic layer
  is classified animated (`lib/renderer/template-schema.ts:274–279`); it still requires analysis,
  uses 30 fps, and has the 5-minute limit. This may be acceptable policy, but needs explicit UX.

## Publishing and security assessment

The existing separation is sound: Next sends metadata/size to Google to initialize a resumable
session; the browser sends MP4 bytes directly to that session
(`app/api/youtube/init-upload/route.ts`, `lib/youtube/uploader.ts`). Scheduled uploads include
private visibility and UTC `publishAt`; no background browser timer is involved. The current
flow is **manual and two-stage**, not one automatic MP3-to-scheduled-video batch pipeline.

Positive logic verified from source and fresh checks:
- Owner identity checked at sign-in, page/proxy boundary, and every YouTube API handler.
- Missing owner config fails closed; Google verified-email assertion is required.
- Public auth session excludes access/refresh tokens; server-only projection supplies access.
- Refresh failures clear stale access, return actionable auth errors; process-local concurrent
  refresh coordination exists, not cross-instance serverless coordination.
- Metadata validates description byte count, tag budget, title constraints and future/private
  scheduling; strict timezone conversion rejects invalid/repeated/skipped DST wall times.
- Upload progress advances only from confirmed offsets; bounded network/5xx recovery queries
  the same session; cancellation propagates and unknown outcomes are not presented as success.
- Render-handoff ownership prevents discarding a rendered file from clearing a different
  manually selected upload; render controls lock during uploads.

No critical credential exposure or authorization bypass was confirmed in this review. This is
not a penetration-test certification. Production OAuth configuration, remote CORS/Range
exposure, real channel/Google quota behavior and actual scheduled publication were not tested.

## Technology-stack comparison

| Requested | Actual source/dependencies |
|---|---|
| Next.js + TypeScript | Present; Next 16.4.0, React 19.3.0, TypeScript. |
| Vercel hosting | Next app is compatible in principle; no deployment was inspected or certified. |
| Tailwind + shadcn/ui | Tailwind v4 present; local custom UI components. No components.json, shadcn package/config or registry components found. |
| React Konva editor | Absent. Native Canvas preview only. |
| Canvas image processing | Present for decode/downscale/composition; requested editing filters/tools absent. |
| WebCodecs encoding | Present through Mediabunny. Unsupported environments get a readable capability error. |
| MP4 muxer | Present through Mediabunny, in-memory fast-start MP4. A separate muxer package is not necessary for this function. |
| FFmpeg.wasm fallback | Absent; no alternative encoding path. Analysis main-thread fallback is not an encoding fallback. |
| Web Audio | Present for whole-track decode/resample/stereo and energy analysis inputs. |
| IndexedDB recovery | Present only for receipt history/migration, not media, projects or active-job recovery. |
| Vercel Blob | No SDK, integration or cloud asset workflow found. |
| Managed PostgreSQL | No DB client, schema, migration or persistent application repository found. |
| YouTube Data API v3 | Implemented for channel, initialization, candidate recovery and status lookup; real deployment acceptance open. |

## Static and animated support: precise boundary

**Static:** First Light, Pulse and Grid generate real MP4 files from fixed layouts, usually
1 fps because the composed image does not change. Static audio cap: 15 minutes. Only tested
short artifacts in this audit; the cap is a code constraint, not proof of a 15-minute pass.

**Animated:** Orbital uses absolute track time and analyzed energy, renders at 30 fps, and has a
5-minute / 9000-frame limit. This is genuine animation, not a still mockup. Its generic
replacement requirement is much bigger: time ranges, property tracks, interpolation/easing,
enter/exit transitions, arbitrary moving nodes, scrub/play controls, and export/preview parity
for the exact same deterministic time evaluator are all absent.

Code constraints: `lib/renderer/profile.ts`, `audio.ts`, `assets.ts`, `encode.ts`.
- Compressed audio cap: 64 MiB; image decoded budget: 32 million pixels; long edge downscaled
  to 1920 px where applicable.
- Encoded payload cap: 192 MiB plus 16 MiB mux allowance. This limits encoded output, not total
  process memory. PCM, bitmaps, canvas readbacks, packets, final buffer and Blob can coexist.
- Static target 1.8 Mbps, animated target 3 Mbps, AAC VBR target 288 kbps; actual bitrate depends
  on content. No fresh long-form speed or memory benchmark was run, and no speedup is claimed.

## Fresh verification performed

All results below were obtained during this audit from current code, not copied from docs.
Node v24.14.1, Chrome 155.0.8059.80, macOS, production build on localhost.

| Check | Result / actual coverage |
|---|---|
| `npm test` | PASS, 106/106, no skipped tests. Pure/schema/auth/metadata/routes/storage/uploader coverage. |
| `npx tsc --noEmit` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS, fresh production build and route listing. |
| `node tools/motion-check.mjs` | PASS, 7 checks through production UI: Worker analysis, deterministic seek, animated download, real decoded output, cancellation. |
| Animated artifact readback | 1920×1080 H.264 + AAC stereo/48 kHz; **180 video packets, 30.00 fps, 6 s**; different sampled frames; limited-range BT.709 in container and SPS. Download: 886,243 bytes. |
| `node tools/f03-upload-check.mjs` | PASS, 25 browser assertions: real static render/handoff, locks, navigation/back/download, immediate visibility, mocked ambiguous upload recovery, receipt reload, partial-transfer failure. Google boundaries mocked. |
| `node tools/idb-durability-check.mjs` | PASS: real IndexedDB commit/abort, migration retry, reopen, blocked upgrade and two-tab broadcast/upgrade. Does not cover consecutive fallback failures found above. |
| `node tools/text-fit-check.mjs` | PASS, 20 real-font title/brand layouts across four presets and too-small rejection. Not editor/variable workflow acceptance. |
| `node tools/fps-readback-check.mjs` | PASS, 60 packets/30 fps/2 s; codec/color/audio checks, dense stereo ~290 kbps, audio-stage abort without Blob. |
| `node tools/a11y-check.mjs` | PASS automated axe checks on home/generate/history/settings and mobile generate; 10/10 primary controls keyboard-reachable, no automated violations. Contrast cases require manual review; not a complete WCAG certificate. |
| Independent cross-track browser probe | Reproduced stale title and wrong-audio export; final harness exit 0 means reproduction succeeded, not that app behavior is correct. |
| Independent duplicate-upload browser probe | Two mocked successful sessions for unchanged source/title, no confirmation. No real upload performed. |
| Independent storage/state probes | Reproduced loss of A on second denied write and private-as-unlisted classification through exported app functions. |

The independent Chrome probe used a synthetic owner session and intercepted all YouTube API
requests; no account access or external publishing was necessary. Its first harness run failed
because CDP attempted to serialize a DOM node; changing the wait helper to return booleans fixed
the harness, and complete runs then succeeded. No application assertion was weakened or skipped.
A shell `rg` inspection was unavailable; equivalent code_search/grep inspections completed.

Evidence logs for this local session: `/tmp/beatflow-logic-tests.log`, `-typecheck.log`,
`-lint.log`, `-build.log`, `-motion.log`, `-upload.log`, `-browser.log`,
`-idb-durability-check.log`, `-text-fit-check.log`, `-fps-readback-check.log`, `-a11y-check.log`
(all with the `/tmp/beatflow-logic` prefix). Temporary standalone reproducer:
`/tmp/beatflow-logic-browser.mjs`. Temporary files are local evidence, not durable deliverables.

**Not verified:** full-length real MP3 encoding, 5-/15-minute artifact readback, low-resource
hardware timing/peak memory, payload-budget breach, every cancellation stage, mobile/Safari
rendering, deployed origin, live OAuth/CORS/YouTube processing or publication. No existing doc
or old benchmark is substituted for those checks. All audit-spawned servers/Chrome processes
were stopped after verification.

## Prioritized implementation sequence

1. **Correctness before expansion.** Bind selected source/decode/analysis/metadata to a stable
   release identity; prevent stale-audio export and cross-track leakage; preserve fallback
   receipts; add private visibility; unify preview/export fallbacks; explicit duplicate/retry
   behavior. Add failing regressions for the reproductions before repairs.
2. **Reusable template documents and storage.** Versioned editor-neutral nodes/asset references,
   stable IDs, transforms/z-order, template identity/revisions, validation/migration and import/
   export. Build My Templates CRUD/duplicate/default/thumbnail metadata. Keep supplied beat
   metadata separate from template layout; wire all seven variables, including year/link.
3. **Static authoring MVP matching the mockup.** Elements + Layers panel, direct-manipulation
   canvas, properties panel; typography, backgrounds, positioned logo/images, transforms,
   selection, undo/redo, snapping, layer order/lock/hide/group and preview. This completes
   preset/customize/blank-canvas entry points before broadening effects.
4. **Branding inheritance and immutable job resolution.** Shared brand/master references,
   explicit allowed overrides and merge order, cycle detection/revisions. Resolve to a literal
   snapshot with asset versions when queued; later master edits affect future jobs, never
   silently mutate already queued content.
5. **Timeline animation.** One deterministic evaluator for preview and export; start with
   fades, move/scale/rotate and background pan/zoom, then transitions, waveform/progress and
   reactive nodes. Add scrub/play, keyframes/easing and duration rules. Validate seek parity,
   transition boundaries, actual encoded frames and cost before promising arbitrary effects.
6. **Durable batch/publishing orchestration.** Multiple inputs, batch template/default and
   per-track overrides; immutable release metadata/assets/scenes, bounded sequential rendering,
   persistent job/session state, retry/cancel/recovery and duplicate protection. Explicitly
   distinguish rendering, uploading, accepted, processing, scheduled, published and failed.
   Cloud asset/database integration and multi-user isolation are separate work, not existing
   capabilities. Measure real-track resources and complete live deployed YouTube acceptance.

**Bottom line:** retain the renderer, data-only scene boundary and direct-upload design, but
make reusable authoring, durable job identity, timeline animation and batch orchestration the
next substantive milestones—not additional one-off preset effects presented as Template Studio.
