# BeatFlow review and repair progress

## Session: acceptance measurements (long render, memory, VLC)

Two M1 acceptance items that had been left as "needs the owner's setup" turned out to be
measurable locally, so they were measured instead of deferred.

- **10-minute render, end to end from the studio UI.** A 14.4 MB / 600 s stereo MP3 plus a
  background photo rendered to a 29,372,995 byte MP4 in 35.8 s wall. The downloaded file is
  `ftyp → moov → mdat` (`moov` first, so fast start survived the long in-memory build), 600.06 s
  per `mvhd` at timescale 57,600, `avc1` + `mp4a` present, no `elst`.
- **VLC plays it.** The freshly downloaded file was decoded by VideoToolbox (`h264`) with the
  `faad` audio decoder. With the scene filter at normal rate the first 60 s produced exactly 60
  unique frames in 369 PNGs (the dummy vout writes each source frame about six times), i.e. every
  1 fps frame; a 120 s sample on the same pipeline gave 120 unique frames in 743 PNGs. The whole
  file then played end to end at 16× in 37.7 s, exit 0. The only log noise is
  the dummy-vout/scene filter blend warning.
- **Five sequential renders do not grow memory.** Renderer-process RSS (summed from `ps` for the
  instrumented profile, GC forced before each reading) went 1264, 1263, 1264, 1267, 1267 MB
  across five 3-minute renders, with peaks of 1384, 1392, 1366, 1366, 1402 MB. Drift: +3 MB
  settled, +18 MB peak, JS heap 5.7 → 5.9 MB. So the spec's criterion holds.
- **Method and one honest caveat.** The first version of this check asserted total growth from
  the idle baseline to the end of the run and failed at +376 MB. That was the wrong criterion:
  the jump is a one-time plateau created by the first big render, and a follow-up probe (render,
  discard, reload) showed it survives a page reload — 1315 MB after the 10-minute render, 1275 MB
  after discard, 1267 MB after reloading the studio — so it is process-level allocator retention,
  not application state (the JS heap stays at ~6 MB and the plateau does not move between the
  five renders). The check now asserts render-to-render drift (< 100 MB) and reports the plateau
  separately. Baselines vary by ±150 MB between tabs, so per-render drift, not the absolute
  number, is what this measures.
- Still external: uploading a rendered file to YouTube by hand at the chosen fps, the
  deployed-origin CORS pass, and a real-device review.

## Session: preview playback (spec section 5 preview rule)

- The studio preview now plays the original MP3, not just draws it: choosing a track creates
  an object URL, shows a native audio element with the file name, and the canvas keeps
  redrawing through the same `drawScene` the export uses. Nothing is encoded for the preview.
- The URL is created by the file handler (not in an effect), revoked when the track is
  replaced, and revoked again when the studio unmounts, so no preview URL outlives its file.
- Tests 51/51, `eslint`, `tsc --noEmit` and a production build clean.
- Real Chrome 155 (headless, production build, synthetic owner session): a 30 s mono MP3
  shows a controlled audio element sourced from `blob:` with the file named in the caption,
  the URL serves its 721,152 bytes, playback advances (`currentTime` 0.86 s, not paused) while
  the canvas still draws, replacing it with a 3-minute track revokes the first URL and serves
  the new one (4,321,152 bytes) in a single element, and navigating to `/history` revokes the
  live URL on unmount. Console empty.

## Session: M4 polish (in progress)

- Discard confirmation: a finished render survives a refused replacement or discard, and the
  studio asks before releasing the previous MP4 (at most one render is ever held in memory).
- `lib/use-before-unload.ts` guards closing or reloading the tab while a render or an upload is
  running, and releases the guard as soon as the work stops or is cancelled.
- Failure state: a photo that cannot be decoded now blocks the render with a visible message
  and a disabled button instead of failing later inside the encoder. Render errors also state
  that rendering uploads nothing and changes no files.
- `lib/settings.ts` takes an optional storage, so the producer defaults (name, timezone,
  default tags, description template) are covered by tests in Node: missing or corrupt JSON,
  field-by-field validation, write/reset, defaults never shared between reads, and blocked
  storage raising so the form can report it.
- Tests 51/51 with lint, `tsc --noEmit` and a production build clean.
- Real Chrome 155 run (headless, production build, YouTube boundary mocked for the upload
  half): the discard gate keeps the same object URL when refused and produces a new one when
  accepted (the confirm text is asserted), the discard action removes the video element once
  confirmed, the unload guard reads armed only while a render or upload runs and releases on
  cancel, and an unreadable PNG disables Render until a decodable image is chosen.
- Still open for M4: reviewing the settings screen on a real device, and the deployed-origin
  pass that M0/M3 also wait on.

## Session: M3 metadata and publishing (in progress)

- Upload history moved from localStorage to IndexedDB as the spec asks, behind a pure
  controller with an injectable backend (`lib/history-store.ts`): validation, newest-first
  ordering, dedupe and replacement by video ID, a 50-entry cap, and a one-time migration of
  the previous localStorage rows. The old key is cleared after migrating, and the store is
  trimmed to the cap rather than the read being capped.
- The first version of that trim was wrong and the new test caught it: trimming the already
  capped list is a no-op, so the store grew past 50 rows while reads looked correct. Fixed by
  trimming the uncapped, sorted store.
- Because the browser still cannot read a resumable session's response, M3 adds a way back:
  `POST /api/youtube/latest-upload` resolves the channel's uploads playlist
  (`channels.list` with `contentDetails`, then `playlistItems.list`) and matches the newest
  upload with the same title at or after the attempt started, allowing two minutes of clock
  slack. Two quota units, no `search.list`, and a pure matcher (`lib/youtube/reconcile.ts`) so
  the rules are unit tested. A miss keeps the outcome unknown instead of guessing an ID.
- The upload desk shows "Upload outcome unknown" with a "Find it on my channel" action. A
  match becomes the normal success card (marked as matched from the channel) and writes the
  history entry, so a real upload that YouTube accepted can no longer vanish from the record.
- Tests: 46/46 with lint, `tsc --noEmit` and a production build clean. New coverage: history
  validation/cap/migration, the release-state helper, defensive channel-upload parsing, the
  matcher window, and the route (owner guard, 400 on bad input, playlist-only lookup with no
  `search` call, 404 when nothing matches).
- Real Chrome 155 run (headless, production build, mocked YouTube boundary): an upload whose
  response cannot be read shows the unknown panel after exactly one init call, the lookup
  recovers `recovered-video` and says where the id came from, a readable upload records
  `direct-video`, and the history page then lists all three rows (migration + both uploads)
  with the localStorage key gone, the rows present in the `beatflow` IndexedDB store, and the
  list surviving a reload.
- Still open for M3: a real run against the owner's channel (quota units, whether a private
  scheduled upload appears in the uploads playlist, and how long YouTube takes to expose it).

## Session: M2 template engine (in progress)

- Added two presets beside `First Light`: `Pulse` (centred title on a full scrim, warm accent,
  drop shadow) and `Grid` (editorial split with the photo cropped to the right half and the
  text on a protected left column). `lib/templates/index.ts` exposes them as
  `TEMPLATE_PRESETS` with an id, description and the parsed template.
- The render studio now has a template picker that switches the live preview immediately; the
  chosen preset is snapshotted per render, so it cannot change frames of an in-flight export.
  The canvas and caption follow the selected template.
- Schema strictness caught a real mistake while adding presets: `Pulse` initially used an
  8-digit hex shadow color and the v1 schema rejected it at module load, exactly as the
  fail-fast parse is meant to. The preset now uses six-digit hex.
- New regression tests: every preset parses, has a unique name, binds only the documented
  variables, and its title layer fits a 115-character title within three lines and its own
  `maxWidth`. Suite is 37/37 with lint, `tsc --noEmit` and a production build clean.
- Real Chrome 155 checks (headless, production build, synthetic owner session): the three
  presets draw visibly different previews and the caption follows the selection; a
  115-character title leaves every title column untouched (pixel-uniform strip just past each
  template's `maxWidth`, covering the accent bar and rules); a 6000 × 4000 photo is decoded and
  downscaled with correct geometry (left/right halves and centre square sampled from the
  preview) and renders a 12 s MP4 in 1.3 s that passes the structural checks.
- Still open for M2: exercising the presets on the deployed origin and on a real track, and the
  Konva template editor that the schema was kept independent for.

## Session: M1 render engine (in progress)

- Built the engine under `lib/renderer/`, kept free of React imports: v1 zod template schema
  with interpolation, asset loading/downscaling with `ImageBitmap.close()`, shared `drawScene`
  for preview and export, pure `layoutText` shrink/wrap/ellipsis, MP3 decode to 48 kHz stereo
  with a 15-minute cap, capability checks, and Mediabunny MP4 encoding (H.264 High
  `avc1.640028` 1920×1080 1.8 Mbps, AAC-LC 288 kbps 48 kHz, `fastStart: "in-memory"`).
- Added the `First Light` preset template and the render studio UI on `/generate`: MP3 + photo
  inputs, live canvas preview through the same `drawScene`, stage progress, cancel, download,
  and "Use for upload" hand-off into the existing upload desk. Mediabunny is loaded on demand
  so the upload page keeps its bundle.
- Regression tests (`tests/renderer.test.mjs`) cover schema rejection, interpolation, and the
  three text-layout outcomes. Suite is 35/35 with lint and `tsc --noEmit` clean; production
  build passes.
- Real Chrome 155 (headless, production build, synthetic owner session) render checks:
  12 s WAV + 2400 px PNG → 457 KB MP4, `ftyp/moov/mdat` order, no `elst`, avc1 1920×1080,
  12 frames at 1 fps, AAC 48 kHz stereo, 12.07 s, rendered in 1.4 s; Chrome presented frames
  during playback; VLC decoded all 12 frames (scene filter) and remuxed the audio track.
- Real MP3 checks with `lame` assets: 3 min → 180.07 s file in 10.4 s, 10 min → 600.06 s file
  in 30.8 s, 30 s mono → 30.08 s file in 1.7 s; all 1920×1080 with `moov` before `mdat`. Duration
  is within 0.1 s of the source. Monitored 3 min renders: cancel mid-render then render again
  works, and five sequential renders grew the JS heap by 0.1 MB after forced GC.
- Uploader change: an unreadable PUT response now raises `UploadOutcomeUnknownError` and the
  desk shows "Upload outcome unknown" with a Studio link. This follows the real owner upload
  that landed on the channel while every browser PUT response was unreadable.
- Still open for M1: uploading a *rendered* file to YouTube manually and confirming it
  processes and plays, and the M2 work (presets, long-title/6000 px photos, template picker).

## Session: studio UI rebuild

- Self-hosted Inter and JetBrains Mono as local variable fonts with their OFL notices; no Google Fonts request remains at build or runtime.
- Added the shared studio shell, responsive navigation, UI primitives, and a local connect/access screen.
- Rebuilt `/generate` around the existing M0 flow: channel state, MP4 drop zone, metadata form, schedule, 8 MiB/256 KiB chunk choice, progress, cancellation, result, and history recording.
- Added `/history` with local-storage filters and clearing, plus `/settings` for local producer defaults (timezone, tags, starting description) used by the next upload.
- Added the authenticated `(app)` layout and extended the proxy matcher to `/history` and `/settings`; unauthenticated requests redirect to the connect screen.
- Refined the visual system: removed duplicate desktop navigation, tightened the shell status hierarchy, raised muted-text contrast, moved form controls to 16px/44px on mobile, added skip links and active-nav indicators, and reordered the mobile upload flow so the form follows the preview.
- Verified `npm run lint`, `npx tsc --noEmit`, production build, and 29/29 tests. Production Chrome checks used a synthetic owner session and mocked channel/upload boundaries: desktop and mobile layouts have no horizontal overflow, local fonts load, settings persist and validate, history filters/clears, and a mocked upload reaches 100% with a recorded history entry. No real Google calls or uploads were made.
- Remaining external gate: the real owner OAuth, deployed-origin CORS, quota, processing, and scheduled publication checks in `M0-FINDINGS.md`.

## Session: authorized M0 repairs

- Added native Node regression runner with existing TypeScript loader; zod is now a direct runtime dependency. No new test framework/service.
- Red/green cycles reproduced then fixed lost upload completion IDs, network recovery, byte offsets, retry bounds/cancellation, public session credential serialization, refresh-error guard behavior, strict DST conversion, and upstream metadata rules.
- Auth.js route wrappers now persist refreshed JWT cookies; synthetic integration test confirms refresh rotation and subsequent reuse without a second refresh.
- Route tests cover JSON auth failures, metadata validation before upstream calls, structured network errors, size-only initialization, and auth cookie persistence.
- Browser-specific form mounts after stable hydration; initialization cancellation, issue detail messages, reauth affordance, status semantics and operation locking implemented; browser verification pending.
- Added required probe assertions and failure-safe resource cleanup; regression tests include expected unsupported exploratory variants. Verification pending after docs/CI updates.
- Test harness setup initially omitted forwarded host/proto and loaded route env too late; fixed fixtures instead of weakening assertions.
- Existing baseline public media/report intentionally preserved. No Google publishing/deployment performed.
- Fresh repaired CLI probe passed required assertions (Chrome 155.0.8059.80): 108,293 bytes, 1920×1080/1fps, 48kHz stereo AAC, 5.077 s, moov before mdat, no elst, full decode and playback. Outputs: /tmp/beatflow-m0-repaired/.
- Production build passed. Fresh production Chrome checks passed in America/New_York and Africa/Lagos: no console/hydration errors, current schedule, public sessions omit both credentials, API errors JSON, detailed validation visible, pending-init Cancel immediately unlocks form, mocked direct upload completes exactly once with accessible 100% progress.
- Final suite: 29/29 pass, including Retry-After, repeated network limits, cancellation during final-resource parsing and unset owner configuration. `npm run lint`, `npx tsc --noEmit`, `git diff --check` and final production build all pass.
- Final production browser checks reran after the last route formatting changes and rebuild: two-zone hydration, credential-free public sessions, JSON API denials, validation detail, init cancel and one mocked upload all pass; browser console empty.
- Package/lock agree; zod is runtime, not dev-only. Baseline public MP4 and historical report byte-equal HEAD. Native runner requires Node 24.7+, documented and declared; npm recorded existing bundled optional Tailwind WASM dependencies when refreshing the lockfile.
- M0 repairs committed and pushed as `b72f677`. Actual owner Google OAuth, deployed-origin CORS/Range/status, quota, processing/scheduled publication remain open in M0-FINDINGS. M1 not started; no deployment performed.
- Added a 256 KiB chunk option to the M0 page for the required non-final 308/CORS acceptance run, with a warning when the selected file fits in one request. Regression tests, lint, TypeScript and production build pass.

## Session: comprehensive review

- Confirmed initially clean working tree, Node v24.14.1, npm 11.11.0.
- Loaded review and file-planning guidance; created review-only notes.
- Scope: all tracked source/configuration/documentation, media probe and bundled output; no implementation or external side effects.
- Previous turn checks: lint 0, TypeScript 0, production build 0. They apply to current unchanged source.

## Review completed so far

- Read every tracked application/auth/API/helper/probe/config/documentation file; inspected lockfile root and zod dependency record (dev-only transitive dependency).
- Re-inspected historical bundled MP4: 108,389 bytes; moov byte 28 before mdat 2221; H.264-tagged 1920×1080/5 samples, AAC-tagged stereo 48 kHz/238 samples; no edit lists.
- Started local production server on 127.0.0.1:3114 with throwaway credentials only. No OAuth or external upload authorized/performed.
- Examined prerendered /generate HTML: schedule and Africa/Lagos timezone are embedded at build time; browser reproduction pending.
- ffprobe/ffmpeg/MediaInfo unavailable. browser-use local Chrome available; cloud prerequisites absent and unnecessary.
- Current YouTube resource docs confirm tag comma/quote accounting and description angle-bracket restrictions. They now contradict historical private-lock claims; research must label this disagreement rather than overclaim.

## Tool limitation and fallback

- Installed browser-use CLI is an agent runner incompatible with the loaded skill's deterministic `--session ... open` syntax (exit 1). Do not install or invoke an external agent/service. Use project's existing direct Chrome CDP technique with a temporary fresh profile instead.
- Local unauthenticated HTTP checks: / 200 with sign-in; /generate, GET channel, POST init-upload all 307 sign-in; auth providers 200 JSON.

## Runtime checks completed

- 13/13 focused evidence checks executed successfully against transpiled actual sources with fake network/auth dependencies. These intentionally demonstrate both working behavior and existing bugs, not a green regression suite.
- Local /api/auth/session with synthetic signed fake-token session returns accessToken, not refreshToken. Local /generate authenticated HTML returns build-time schedule.
- Chrome CDP with fresh temporary profile reproduced timezone-dependent hydration error #418, generic-only validation messages, and Cancel remaining busy while init-upload is pending. Google/channel/init requests were mocked in-browser; no real upload occurred.
- Fresh run of unchanged probe.html saved media only under /tmp: all 7 steps passed; 108,314-byte MP4, 1920×1080, 5 video samples, 48kHz stereo AAC, moov before mdat, no edit list, 5.077s duration; Chrome playback and full packet decoding passed. 465 ms synthetic render measured, not representative long-form performance.
- Original public MP4 and report.json remain unchanged.

## Final review deliverable

- `findings.md` contains the complete review, corrected earlier assertions, priority/fix directions, actual product intent, milestone matrix, and acceptance gaps.
- Additional isolated runner check confirmed its zero-status behavior despite failed required steps/null inspection; this finding is demonstrated, not merely inferred.
- Inspected bundled avcC (High/level 4.0) and nclx color fields (primaries 1, transfer 13, matrix 1, full range); full BT.709/chroma/progressive acceptance remains unverified.
- No implementation, installs, deployments, OAuth, real Google calls, or uploads occurred. Only review markdown files were added; all application/baseline artifact files are unchanged.
- Browser/probe/Next processes created for the review are shut down during final cleanup.
- Remaining acceptance checks require actual Google project/deployed origin and future M1 implementation: publication/CORS/quota, real MP3/image 3/10-minute renders, VLC/ffprobe validation, unsupported-codec UX and repeat-render peak-memory measurement.

## Session: open hardening list repaired (18 October 2026)

- Image input: PNG/JPEG/WebP/GIF headers are read for dimensions before decode, images above 32 MP are rejected, and large photos use `createImageBitmap` resize options so supporting decoders resize during decode rather than retaining a full-size bitmap. Audio input: 64 MiB compressed and 15-minute limits are enforced before the `AudioBuffer` allocation, using a metadata-only duration probe that times out after 5 s. `tests/budget.test.mjs` covers both guards and the header parser.
- Audio bitrate: decided as a 288 kbps AAC VBR target, not a hard floor. Real Chrome measurements gave 290 kbps on 10 s dense stereo and 64 kbps on a 2 s sine; `bitrateMode: 'constant'` was byte-identical to the default, so it cannot enforce a floor for AAC. `npm run fps:check` now asserts the dense-stereo measurement stays in the spec's 256–320 kbps range.
- History: added owner-only `POST /api/youtube/video-status` (`videos.list`, max 50 IDs) and a History **Refresh from YouTube** button. Real `checkedAt` status now drives `published`/`unlisted`/`failed`; a passed timestamp alone no longer claims publication. The production browser check drives the route, sees the badge change, and reloads to confirm the status was stored in IndexedDB.
- IndexedDB: blocked upgrades reject instead of hanging, `versionchange` closes the database, failed opens are retried, memory-fallback rows flush into IndexedDB on the next access, and a `BroadcastChannel` prompts other tabs to reread. A two-tab blocked-upgrade replay was not run.
- Accessibility: the template picker uses three native radios in a labelled radiogroup, `Field` links hints/errors with `aria-describedby` and sets `aria-invalid`, and `TagInput` forwards the description. The production browser check asserts the radios and hint links. No full WCAG audit.
- Maintainability: upload orchestration/state moved to `lib/use-upload-job.ts`; `app/(app)/generate/page.tsx` is 815 lines (was 1043) and the extracted flow still passes the full browser replay.
- Removed the M0 demo copy from the studio, home, shell and sample links.
- Verification: `npm test` 81/81, `tsc --noEmit`, `eslint`, `next build`, `npm run fps:check`, `npm run upload:check` 25/25, and `npm run idb:check` all pass. Deployed Google behavior remains open in `docs/M0-FINDINGS.md`.

## Session: two-tab storage, WCAG audit and peak memory (18 October 2026)

- Two-tab replay in `tools/idb-durability-check.mjs`: a raw holder in tab A blocks tab B's v2 upgrade; the adapter rejects with an actionable error, then the upgrade completes after the holder closes. A write in either tab wakes the other through `BroadcastChannel`, and after tab B upgrades the schema tab A reopens at the current version instead of failing with `VersionError`. The replay exposed and fixed two bugs: reader-only tabs never opened a channel, and a blocked request that later succeeded leaked a connection.
- Accessibility: added axe-core 4.14 as a dev dependency and `tools/a11y-check.mjs`. It audits `/`, `/generate`, `/history`, `/settings` and mobile `/generate` against WCAG 2.0/2.1/2.2 A+AA with a synthetic owner session, then tabs through the studio. Result: 0 violations in five runs, 69 keyboard stops, all 10 primary controls reached. Fixed the brand link's mismatch between visible text and `aria-label` (removed the label), and replaced the duplicate `Choose MP4` label with a real button so the file input has one label. Color-contrast is “incomplete” over gradients; token pairs measure 6.39:1–14.88:1.
- Peak memory: `tools/memory-check.mjs` drives the production UI with synthesized 48 kHz stereo WAVs and samples the Chrome process tree every 100 ms. On the agreed 8 GB 2013 MacBook Air target, with a 1536 MiB renderer budget: 30 s → 831 MiB, 3 min → 997 MiB, 5 min → **1042 MiB** peak renderer (1457 MiB whole tree), 21.7 s wall. Five 30 s render/discard cycles retained 691–693 MiB, +2 MiB final-minus-first. Beats are typically 3–5 minutes, so 5 minutes is the measured maximum.
- Production runbook: `docs/PRODUCTION-RUNBOOK.md` covers preconditions, consent/redirect, deployed CORS/308, scheduled publication, quota readings and a result template. `tools/production-status.mjs` records the channel and up to 50 video statuses read-only, without printing the cookie. Only argument validation was run locally; the real path remains owner-gated.
- Scripts added: `a11y:check`, `memory:check`. `idb:check` now includes the two-tab replay.

## Session: BT.709 output conversion and tagging (18 October 2026)

- A controlled probe settled the mechanism: a canvas-sourced H.264 frame is tagged sRGB (transfer 13, full range) in both the `colr` box and the SPS VUI, while the same pixels encoded through a `VideoSample` with an explicit `{ primaries: bt709, transfer: bt709, matrix: bt709, fullRange: false }` colour space are tagged transfer 1, limited range. Chromium honors the frame colour space; no MP4 byte patching is needed.
- Added `lib/renderer/color.ts`: a 256-entry sRGB-EOTF → BT.709-OETF lookup conversion and the explicit `BT709_COLOR_SPACE`. `lib/renderer/encode.ts` now reads the composed canvas once, converts it, and encodes frames through `VideoSampleSource` instead of `CanvasSource`. Static designs convert once regardless of frame count.
- Added `readColorTags()` to `tools/m0-probe/mp4.mjs`: a real H.264 SPS VUI parser (emulation-prevention removal, Exp-Golomb, high-profile fields, VUI colour description) plus a validated `nclx` reader. Against the bundled historical MP4 it reproduces transfer 13 / full range in both places; `tests/probe.test.mjs` pins that. `tests/color.test.mjs` pins the conversion values (0→0, 10→3, 64→48, 128→115, 200→194, 255→255, alpha untouched, input not modified).
- `npm run fps:check` re-encodes 30 fps and now asserts the container `colr` and SPS VUI both say primaries 1 / transfer 1 / matrix 1 / limited, while Mediabunny readback reports `bt709/bt709/bt709/false`; video/audio readback and abort behavior still pass.
- Re-verified after the encoder change: 84/84 tests, lint, TypeScript, production build, `upload:check` 25/25, `a11y:check` 0 violations. Peak memory on the same target: 30 s 1000 MiB, 3 min 1283 MiB, 5 min 1067 MiB renderer (budget 1536 MiB), five-cycle retention +4 MiB. VLC (VideoToolbox h264 decoder) played the freshly encoded 30 fps file to the end with exit 0; the only log noise was the known dummy-vout blend warning. The scene-filter frame-counting pass was not repeated.

## Session: audio-reactive Orbital preset (18 October 2026)

- `Orbital` is the fourth preset and the first schema-v2 template: a discriminated `graphic`
  layer (`generator: "orbital-field"`, `recipeRevision: 1`) with a bounded box, four colours
  and settings validated at module load. v2 also adds `requires` on text layers, so the BPM,
  key and message labels disappear when their variable is unset. `buildOrbitalTemplate()` is
  the only path that adds a photo variant (image plus a 62% scrim) and it re-parses the
  result, so a missing photo never silently changes the composition.
- The generator (`lib/renderer/graphics.ts`) draws from a fixed PRNG seeded once per prepared
  scene, with at most 720 ring segments and 24 markers. Every frame is derived from absolute
  track time, saved settings and sampled features — no incremental rotation or spring state —
  so seeking to 42 s draws the frame playback would have reached. Bounds are shared by the
  schema, the studio controls and the tests: 1–12 rings, 0–1600 particles, 15–65° tilt, 0–2
  sensitivity, −4–4 rpm and 0–0.08 maximum pulse.
- Analysis (`lib/renderer/audio-features.ts`, algorithm version 1) is pure numeric code:
  48 kHz, 800-sample hops (60 Hz), full-band RMS plus broad 40–180 / 180–2000 / 2000–12000 Hz
  bands from fixed RBJ biquads, mean channel power (opposite-phase stereo does not cancel), a
  −60 dBFS floor and 10 ms attack / 160 ms release. Results are four `Float32Array`s with
  implicit timestamps and the final partial hop pinned exactly at the duration.
- `analyzeAudio()` runs that core in a bundled module Worker and transfers one second
  (48,000 samples) of sliced channels per request, one request in flight; the decoded
  `AudioBuffer` is never detached. A worker that never becomes ready falls back to the same
  core on the main thread, while a numeric failure is reported as an analysis error.
  Cancellation terminates the worker, and the studio's generation counter prevents a
  replaced track's late result from overwriting the new one.
- New `lib/renderer/profile.ts` derives the profile from the resolved scene: static keeps
  1 fps / 1.8 Mbps / 15 minutes; animated is 30 fps / 3 Mbps / 5 minutes, and any other
  requested fps on an animated scene is rejected instead of silently producing a still.
  `checkRenderCapabilities()` now checks the selected bitrate. `encodeMp4()` gained a
  per-frame draw hook: animated scenes redraw, convert to BT.709 and encode each frame with
  `latencyMode: "quality"`, progress is throttled to about 200 updates, and a 192 MiB packet
  budget plus a 16 MiB mux allowance is enforced during encoding and on the final Blob.
- Studio: four presets as native radios. Orbital adds optional BPM (20–300), key (33
  spellings), message and producer fields, appearance sliders, a motion toggle, sensitivity,
  rotation and maximum-pulse sliders, and Shuffle pattern (a new seed). Analysis progress is
  announced and Render stays blocked until it is ready; before that the canvas is explicitly
  a still “Design preview — add audio for reactive motion”. Once ready, the native source
  audio element drives a `requestAnimationFrame` loop that samples the cached table by
  `currentTime` and draws through the same prepared scene as the export; pause, seek, ended
  and metadata redraw exactly one frame, and React state is not updated per frame.
- Verification: `npm test` **106/106** (new `tests/features.test.mjs` and
  `tests/orbital.test.mjs`), `tsc --noEmit`, `eslint` and `next build` clean.
- `npm run motion:check` (Chrome 155.0.8059.80, production build) passes 7/7: the still
  preview shows no fake motion, the worker analysis unlocks the 30 fps render, a paused
  preview reacts to energy (hash 2660247814 quiet vs 2976253781 loud) and reproduces the
  quiet frame after seeking back, the export downloads 885,363 bytes with 180 packets at
  30.00 fps over 6 s (H.264 + AAC, quiet and loud frames differ), the container `colr` and SPS
  VUI both say limited-range BT.709, and cancelling during video encoding returns to the
  cancelled state with no artifact.
- `MEMORY_PROFILE=orbital MEMORY_MODE=quick npm run memory:check` on the same 8 GB 2013
  MacBook Air target with the 1536 MiB renderer budget: the 30 s beat peaked at **906 MiB**
  renderer memory (1337 MiB whole tree) and took **84.7 s**; the five 30 s render/discard
  cycles peaked at 893, 817, 853, 873, 881 MiB with retained readings 510, 486, 490, 492,
  493 MiB, i.e. −17 MiB from the first to the last. Analysis is included in every run.
- `npm run text:check` now also covers Orbital's title and producer bands (the strip past
  each box stays uniform with a 115-character title), and `npm run upload:check` still passes
  after the picker change.
- Open limits: 3 Mbps is provisional pending the owner's 1.8 / 3 / 4.5 Mbps visual
  comparison; there is no saved preset/library and no explicit still export yet; BPM and key
  are typed display metadata, not analysis results; the preview follows the media element's
  `currentTime` and no encoder-delay offset against the decoded PCM has been measured; the
  retention cycles are only measured on 30 s beats, not on a 5-minute render; and the
  deployed-origin and real-device passes remain open.

## Session: full-length Orbital memory proof (18 October 2026)

- Ran the animated profile at its documented cap instead of extrapolating from 30 s. The
  first attempt did not produce a number: the check's 900 s wait expired while the 300 s
  render was still encoding at a steady rate, so the 5-minute case was unmeasurable by
  construction. The encode itself was never stuck — 9000 frames at roughly 110–130 ms each
  needs about 20 minutes.
- Fixed `tools/memory-check.mjs` rather than the renderer: the orbital wait is now 30
  minutes, `MEMORY_DURATIONS=30,180,300` selects beat lengths, `MEMORY_RETENTION=0` skips
  the five cycles, and the wait logs the studio's stage and percentage every minute and
  reports the last one if it still times out.
- Measured on the same 8 GB 2013 MacBook Air target with the 1536 MiB renderer budget
  (Chrome 155.0.8059.80, production build, analysis included): 30 s beats peaked at
  **960 MiB** renderer (1354 MiB tree) in 97.3 s, and 928 / 1216 / 1106 MiB in three later
  runs (the last in 53.4 s — wall time depends on what else the machine is doing);
  3 min at **1021 MiB** (1438 MiB tree) in 584.6 s; and the full 5 min / 9000 frames at
  **1046 MiB** renderer (1477 MiB tree, 843 MiB baseline, 537 MiB retained after discard) in
  **1175.8 s** — 490 MiB under the renderer budget, with the whole Chrome tree (browser, GPU
  and renderer processes) peaking at 1477 MiB.
- Peak readings swing by a couple of hundred MiB between runs on this machine (928 → 1216 MiB
  for the same 30 s case), so the 5-minute peak is not compared to a single 30 s figure.
  What the run does show is that 9000 frames land in the same band as 900, with 537 MiB
  retained after discard and −77 / +5 MiB across two five-cycle runs: no rise with track
  length. The arithmetic points at steady-state allocations rather than the frame loop —
  5 minutes of stereo Float32 PCM is ~110 MiB, the 60 Hz feature table ~0.3 MiB (18,000 hops
  × 16 bytes), and the muxed in-memory output ~112 MB at 3 Mbps (inside the 192 MiB packet
  budget) — but that split was not measured piece by piece.
- Re-ran the documented quick command twice after the tool change, including once against
  the final file: **PASS** both times, with cycles peaking at 973/887/897/826/829 MiB
  (retained 512 → 434 MiB, −77) and then 956/955/946/950/977 MiB (retained 566 → 571 MiB,
  +5). The success run also exits on its own with code 0.
- A failed render used to leave the process alive: the 100 ms memory sampler was still armed
  when the wait threw, so the event loop never drained (a timed-out run sat for 75 minutes).
  The sampler timer is now unref'd, both render waits stop it in a `finally`, teardown calls
  `closeAllConnections()` before `server.close()`, and a deliberately shortened timeout now
  exits 1 with `..., last progress: Encoding video frames17%` and no stray process.
- Still open: the five retention cycles are measured on 30 s beats only; the 5-minute run
  proved the artifact is offered for upload but did not probe its 9000-frame count or
  duration from the downloaded bytes (only the 6 s export in `motion:check` is probed that
  way); and 19.6 minutes is a wall-clock figure for an offline export — nothing in the UI
  promises a faster one.

## Session: preview iteration and release templates (20 October 2026)

- Re-rendering is no longer destructive: the previous MP4, its object URL, and the upload
  handoff survive until a new render succeeds, so a failed or cancelled attempt costs only
  time. A cached decoded buffer/feature table is still reused for Orbital.
- The studio compares a signature of the current inputs with the last successful render and
  labels the file "matches preview" or "previous settings", with a notice that names the
  render button. The old confirmation prompt is removed.
- Added `lib/release-templates.ts` with a type-beat description (license, contact, hashtags,
  tag dump) and `fillDescriptionTokens`; Settings can insert it and the upload desk fills
  `{{track_name}}`, `{{producer_name}}`, `{{year}}`, `{{key}}` and `{{bpm}}`, leaving
  bracketed contact details and `[KEY]`/`[BPM]` visible when unknown.
- Added starting tag suggestions (`lib/tag-suggestions.ts`): grouped lists, case-insensitive
  duplicate detection, comma-text helpers, and a native-select picker in Settings and the
  onboarding metadata step. Free text remains unrestricted.
- Verified: 156 tests, `tsc --noEmit`, ESLint, production build, new `rerender:check`
  (stale badge, old file playable mid-render, no dialog, new file adopted), `onboarding:check`
  (template picker + desk fill), `upload:check` 25/25, and `a11y:check` with 0 automated
  violations.
- Not covered: a re-render of a 5-minute Orbital track (the memory check still renders once
  per cycle), and the two-blob peak during a re-render is inferred rather than measured.

## Session: no-photo path and Orbital colour (21 October 2026)

- Added bundled starter backgrounds (`lib/starter-backgrounds.ts`, three original 1920×1080
  JPEGs already in `public/images/orbital/`) with a one-click picker in the render studio.
  No web search or external service: a starter is fetched from this origin and becomes a
  normal `File`, so missing artwork is no longer a dead end for First Light/Pulse/Grid.
- Fixed the export colour pipeline: the canvas is sRGB and WebCodecs already converts it to
  limited-range BT.709, but the encoder pre-applied a second BT.709 OETF. Exports decoded
  far darker than the preview (#08080d → ~1,3,2; #404040 → 48 instead of 64). With the LUT
  removed, the real export decodes the field as 8,9,13. `motion:check` now asserts that.
- `motion:check` also follows the non-destructive re-render contract: a cancelled re-render
  keeps the previous MP4 downloadable under the same URL, instead of the old
  “no artifact after cancel” expectation.
- Inspected the export timing: 180 packets at exactly 30 fps, no duplicate frames, 6.000 s
  video, 6.080 s AAC (padding, no edit list → ~21 ms offset), front moov, BT.709 tags.
- Bitrate on this dark scene averages ~0.85 Mbps against the 3 Mbps cap; forcing constant
  rate did not change it, so the profile is unchanged. Motion remains deliberately slow
  (median 0.012/255 frame-to-frame change); “laggy” playback still needs the actual YouTube
  link or file to distinguish YouTube processing from 30 fps cadence.
- Verified: 160 tests, `tsc --noEmit`, ESLint, production build, `motion:check` (8),
  `onboarding:check`, `upload:check` 25/25, `a11y:check` 0 violations.
