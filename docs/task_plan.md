# BeatFlow comprehensive review plan

## Active build: complete local-first Template Studio and batch automation

Owner decisions (current request): owner-only; no cloud services; open tab for sequential
render/upload; keep static 15-minute and animated 5-minute limits. Approve a batch once,
then automate. Recurring weekly slots (e.g. Wednesday 17:00 in a chosen timezone), multiple
slots, first eligible date, per-track overrides, skip slots reserved by known jobs/history.
Dates must be previewed before approval. No real upload/deployment/commit is authorized
by local verification; UI approval permits the owner's subsequent uploads.

Acceptance boundaries:
- Preserve v1/v2 presets and owner gates. Editor-neutral versioned authoring documents.
- New `/templates` library/editor and `/batch` desk; templates/branding/assets/jobs in IndexedDB,
  portable template JSON, errors on failed writes, immutable scene+asset snapshots for jobs.
- Preset/customize/blank flows; layer insertion/manipulation/properties/undo/redo/snapping,
  ordering/lock/hide/group/alignment; all seven variables; image/logo/shape/text/visualizers.
- Shared deterministic preview/export timeline (transforms, fades, easing, clip visibility),
  waveform/progress; inherited branding resolved before job approval; validate cycles.
- Batch multi-file selection/default+overrides, local-time slot preview/conflict avoidance,
  sequential rendering/upload, pause/cancel/retry/reload recovery, persisted resumable sessions,
  duplicate prevention and truthful accepted/processing/scheduled/published/unknown states.
- Fix audited bugs with regressions. Verify Node/type/lint/build plus production Chrome
  source-switch/editor/save/reload/scheduler/batch/upload mock and actual MP4 readback.
- Local only: browser eviction or clearing data can destroy projects; no silent fallback for
  job durability; no background work while browser closed; live Google acceptance separate.

Phases: decisions complete; reliability in progress; reusable library pending; static editor
pending; shared timelines pending; batch pending; fallback pending; final verification pending.

Parallel workers: user requested numerous subagents; no spawn tool is exposed. Installed
Freebuff CLI only supports interactive conversation/login, not noninteractive worker spawning.
Use parallel independent inspections/checks without claiming delegated work.

Errors/notes: bundled Next guide path for use-router.md was absent; client/server guide read.
Existing audit docs retained as historical findings, not implementation evidence.

Reliability progress: red/green storage and upload regressions completed; source identity
checks added and passing. UI invalidates cached analysis synchronously, derives per-file
readiness, resets per-track title/BPM/key, shares preview/export title resolver, warns on
unsaved artifacts and repeat/uncertain uploads. Full browser verification still pending.
Dependency install initially exceeded 60s; rerun in BACKGROUND completed exit 0. Konva,
react-konva and local FFmpeg packages installed. npm audit reports five high dev-toolchain
advisories through existing eslint-config-next; do not force a framework downgrade.

Implemented foundations (not yet full browser-verified): commit-aware studio IndexedDB store,
validated neutral v3 documents/preset migration, branding resolution/cycle checks, immutable
snapshots, portable embedded-asset import/export, deterministic timeline and weekly slot
allocator. Core tests pass (11). `/templates` now has library+three-panel Konva overlay editor,
properties/layers/undo/redo/snapping/timeline controls/shared Canvas preview and MP4 export.
Remaining UI verification and resource/security repairs take priority before claiming done.

Batch desk/runner implemented with local media snapshots, weekly calendar preview, default
and per-track design/date/metadata/artwork overrides, approval, Web Locks, sequential render,
local MP4 retention, persisted resumable sessions/status queries, retries/reconciliation and
remote status refresh. Needs end-to-end browser acceptance, not yet claimed complete.
Production Chrome studio-check now passes 10 checks: create/edit/save/reload template,
multi-file weekly schedule preview, durable approval, immutable design snapshots, two real
per-track 1080p MP4 outputs, mocked one-session-per-job uploads/status checks and reload.
Initial harness issues: reused field ID selected wrong input; wait raced document.body;
mock upload lacked CORS headers. Repaired harness, no assertions weakened. Still need
actual manipulation, inheritance/import, animation/fallback and interruption verification.

Full suite now 121 passing. First build failed on FFmpeg ESM's dynamic Worker URL under
Turbopack; use its supplied self-hosted UMD distribution instead of altering node_modules.

---

## Current session: full product logic sweep (19 October 2026)

Review baseline: `baa44bb`; working tree initially clean. Audit only: no application fixes,
new dependencies/services, deployment, Google uploads, or changes to credentials.

Acceptance criteria:
- Compare the user's pasted requirements and attached three-panel editor mockup with the
  actual shipped code, not existing docs or the aspirational design document.
- Cover presets, customization, blank-canvas authoring, dynamic variables, all six design
  categories, saved-template management, static/animated timelines, publishing, batching,
  durable recovery, branding/inheritance, snapshots, and the proposed stack.
- Trace current logic and reproduce significant defects where practical; distinguish
  confirmed defects, missing features, partial foundations, and external acceptance gaps.
- Deliver `docs/product-logic-sweep.md` with file/line evidence, verification results,
  limitations, and prioritized next milestones. Preserve existing implementation.

Phases:
1. [complete] Map requirements to implementation using source/dependencies/routes only.
2. [complete] Trace correctness and failure paths; independently reproduce stale-track audio,
   cross-track titles, fallback receipt loss, private-state mislabeling and duplicate submission.
3. [complete] Fresh 106 tests, TypeScript, ESLint, production build; production Chrome motion
   and upload/handoff replays; real IDB, fonts, MP4 readback and automated accessibility checks.
4. [complete] `docs/product-logic-sweep.md`: full requirement matrix, file/line evidence,
   confirmed defects, limitations, stack comparison and prioritized implementation sequence.

Existing documentation and prior benchmark claims were explicitly excluded as evidence at
owner request. No application source or dependencies changed; no live Google upload or deploy.
Temporary browser harness initially needed a CDP serialization repair, then completed twice;
all substantive checks passed, while the independent probes confirmed app defects. Long-form
performance, real MP3/device matrix, deployed OAuth/CORS and real publication remain unverified.

Session notes and evidence are consolidated in `docs/product-logic-sweep.md`.


## Current session: M0 reliability repairs

Authorized by the owner after the review. Fix confirmed M0 errors without starting M1 or performing external uploads/deployment.

Acceptance criteria:
- Keep existing uploader interface and direct browser-to-Google media flow; recover within the same session, preserve completed IDs, use confirmed offsets, cap retries, and abort data/status/backoff requests.
- Preserve owner checks in proxy and handlers; public auth session must contain no access/refresh credentials; refreshed JWT cookies must persist on API responses; refresh failures return actionable 401 JSON.
- Stable hydration; strict valid dates; correct timezone conversion; reject nonexistent/ambiguous DST wall times rather than guessing.
- Match YouTube tag/description rules and display server issue details; cancellation works during initialization.
- Required media-probe failures exit nonzero; preserve baseline media/report by using isolated output paths during verification.
- Add native Node regression tests using already installed TypeScript, wire tests into CI, and declare existing zod runtime usage directly. No new service or test framework.
- Run tests/lint/typecheck/build and exercise the production browser/API interface with fake credentials and mocked Google boundaries. Actual production Google CORS/scheduling/quota remains an external M0 gate.

Repair phases:
1. [done] Native Node tests and direct zod declaration.
2. [done] Reliable resumable upload, bounded recovery and cancellation.
3. [done] Server/public auth boundaries, response-persisted refresh, API errors, strict scheduling and UI fixes.
4. [done] Required probe assertions, CI regression command, refreshed M0 acceptance documentation.
5. [done] Final 29 regression tests, lint, TypeScript, production build, two-zone production browser verification and isolated real media probe.

No M1 renderer, deployment, OAuth, or real upload has been started. Remaining M0 acceptance requires the owner's configured Google project and production origin. The M0 page now exposes a 256 KiB chunk option for the required non-final 308/CORS check. Test services are stopped after verification.

## Original review goal and acceptance criteria

Understand the owner's intended end-to-end workflow, review every tracked text/configuration file and the bundled MP4, distinguish current M0 requirements from future M1–M4 work, and deliver prioritized findings with file/line evidence and reproducible checks where possible.

- No application implementation, dependency installation, deployment, uploads, or account changes.
- Preserve existing source files and baseline artifacts; use temporary files for checks.
- Assess the exact rendering interface, MP4 format requirements, low-resource goals, authentication boundaries, upload reliability, and milestone acceptance criteria.
- Do not claim authenticated Google, production CORS, publication, playback in VLC, long-form rendering, or memory acceptance checks passed without evidence.

## Phases

1. [complete] Map product intent, milestone gates, and repository scope.
2. [complete] Review auth, API routes, upload, time conversion, and UI.
3. [complete] Review probe, artifacts, dependencies, configuration, and CI.
4. [complete] Reproduce findings with isolated checks and local HTTP/browser behavior.
5. [complete] Synthesize severity, previous-review corrections, and readiness.

## Baseline

- Working tree initially clean.
- Previous turn already passed lint, typecheck, and production build; do not repeat unchanged checks unnecessarily.
- Review notes are the only intended repository additions.

## Errors / limitations

- No agent-spawning tool is available in this session; review used the available read/search/terminal/browser tools.
- browser-use CLI did not support the skill's deterministic syntax; fresh-profile Chrome CDP fallback succeeded without installation or services.
- Google credentials/deployment/real publishing, external media validators, VLC, long-form rendering, and peak-memory acceptance were unavailable or out of scope.

## Deliverables

- `findings.md`: full product/architecture review, prioritized evidence-backed findings, current external-source corrections, media/performance gaps, verification matrix, milestone sequence.
- `progress.md`: verification and tooling record.
- This plan: all review phases complete; no application fixes were requested or applied.

---

## Completion session: verification and navigation repair (19 October 2026)

The Template Studio and batch desk work is implemented and verified in a fresh production build.

Fixes made during acceptance:
- Preset customization now retains minimum font size, line height, conditional BPM/key text,
  shadow offsets and the exact Orbital recipe/colours. Studio title fitting uses those values.
- Preview, approval and batch preview share one resolver for titles, branding, variables and
  image bindings, so an approved job matches what was reviewed. Logo bindings no longer shadow
  a node's own asset.
- Portable template imports reject unreferenced assets; exports flatten inherited branding.
- Batch scheduling preferences persist, invalid saved zones fail visibly, and queue mutations
  (retry, date, recovery, cancel, removal, status refresh) re-read the stored job under the Web
  Lock so a stale tab cannot overwrite newer state.
- Job asset removal is one IndexedDB transaction. Resume of an interrupted initialization uses
  the existing session; only a job with no session is rejected from retry.
- The back-button trap briefly looked inactive while guards re-registered (render handoff to
  upload), which could send the owner back to History mid-flow. Guard messages now stay stable
  and reconcile after React commits; verified by the full upload replay.
- Accessibility fields now get a generated id when none is supplied, so every label is linked.

Verified (Chrome 155, production build):
- `npm test`: 125 passing, 0 failing.
- `npx tsc --noEmit`: pass. `npm run lint`: pass. `npm run build`: pass.
- `tools/studio-check.mjs`: 15 checks — library/blank design, dynamic text, pointer drag,
  undo/redo, hide/lock, portable export/import, reload, real editor download, WebCodecs
  animation, FFmpeg fallback with H.264/AAC BT.709 tags, weekly batch preview, approval,
  immutable snapshots, Web Lock exclusion, paused-upload resume after reload, independent
  1080p MP4 durations, no duplicate initialization, deterministic animation scrubbing.
- `tools/f03-upload-check.mjs`: 25 assertions, including link/back guards, download bypass,
  artifact ownership, unknown-outcome recovery and durable history refresh.
- `tools/motion-check.mjs`: 7 checks (worker analysis, deterministic seek, 30 fps export,
  decoded frame difference, BT.709 tags, cancellation).
- `tools/a11y-check.mjs`: 0 automated violations across home, generate, history, settings,
  templates, batch and mobile generate; 69 keyboard stops, 10/10 primary controls.
- `tools/idb-durability-check.mjs` and `text-fit-check.mjs`: pass.

All YouTube traffic in these checks was mocked; no upload or publication was performed. Live
OAuth/CORS/quota/processing/publication, long-form resource use for custom documents, and
external-device playback remain open external acceptance items.

### Post-push review corrections

- The FFmpeg path no longer converts sRGB→BT.709 before JPEG encoding and then converts again
  inside FFmpeg. It now lets FFmpeg perform one explicit full-range BT.601→limited BT.709
  conversion, with the same verified container/SPS tags.
- Animation keyframes are sorted once per track instead of on every frame.
- Cancelling an export or pausing the queue no longer appears as an error.
- The canvas scale clamp now matches the schema (0.01–20).
- Branding roles shown in the editor are limited to effects that actually apply; legacy
  producer/message roles were no-ops because those values already come from variables.
- Duplicate-upload protection now keys on upload identity (name, size, modified time), so a
  re-wrapped File for the same rendered artifact still prompts before another session.
- Batch preview decodes/analyses audio once per source file rather than per title keystroke,
  and the editor debounces image reloads while typing.
- A rejected upload-initialization response is a normal failure (no session could exist);
  only network/timeout or unusable responses remain “unknown outcome”.

Re-verified: lint, TypeScript, build, 125 tests, 16 Studio checks (including batch preview and
FFmpeg export), and 25 upload assertions.

---

## Preview iteration and description templates (20 October 2026)

Two owner requests: a reusable release description built from the channel's type-beat
post, and a preview that does not throw away a finished MP4 when something is adjusted.

### Description template

- `lib/release-templates.ts` holds the "Type beat · license + contact" body and
  `fillDescriptionTokens()`. Tokens (`{{year}}`, `{{track_name}}`, `{{producer_name}}`,
  `{{key}}`, `{{bpm}}`) fill from data the app already has; `[BRACKETS]` stay visible for
  the owner's links and handles, and `[TRACK NAME]` / `[KEY]` / `[BPM]` are the explicit
  "put your release details here" markers.
- Settings → Starting description gained an "Insert a template" picker (replace is
  confirmed when text exists). The upload desk fills tokens on mount, on a new source, on
  a render handoff (including the render's BPM/key), and on a settings refresh — only while
  the description is untouched. Batch drafts fill per track from the filename.
- Tests: 6 unit assertions (sections present, byte limit, no leftover tokens, fallbacks,
  idempotence, unknown tokens untouched, hint list matches the body).

### Non-destructive re-render

- `lib/render-signature.ts` signs every input that changes the encoded file. The studio
  keeps the signature of the last successful render and compares it with the live inputs.
- The replace confirmation is gone. A re-render no longer releases the previous blob, URL,
  or upload artifact up front: the new file is encoded alongside it and swapped in only on
  success. Failure and cancel leave the existing MP4 playable and uploadable.
- UI states: "MP4 · matches preview" vs "MP4 · previous settings", a "Preview updated"
  notice naming the render action, and a progress note that the current file stays
  available. Cancelled/error copy now says the previous MP4 is unchanged.
- Trade-off: during a re-render both MP4 blobs are in memory briefly (worst case ~2 × 112 MB
  at 3 Mbps for a 5-minute Orbital render, still under the 1536 MiB renderer budget, but not
  measured by `memory:check`, which never re-renders).
- `tools/rerender-check.mjs` (`npm run rerender:check`) proves it in production Chrome: stale
  badge after an edit, old file still playing mid-render, no dialog, new file and
  "matches preview" after completion.

### Tag suggestions

- `lib/tag-suggestions.ts` holds three groups of starting tags (genre, release type,
  discovery) plus `parseTagText`, `addTagToText`, `mergeTag` and `hasTag`. Free text is
  still the source of truth; suggestions only shorten typing.
- `components/ui/tag-suggestions.tsx` is a native `<select>` with `<optgroup>`s, so keyboard,
  screen-reader and mobile behaviour come from the platform. Tags already in the field are
  disabled and labelled `· added`.
- Settings → Default tags and the onboarding tag step both expose the picker. Onboarding
  keeps its comma-separated text field (helpers normalise separators and ignore duplicates
  by case); Settings keeps the chip-based `TagInput`, and picking a suggestion merges once.

Re-verified: 156 tests, TypeScript, ESLint, production build, `rerender:check`,
`onboarding:check` (now also drives the template picker, desk fill and both tag pickers),
`upload:check` (25/25, including render, handoff, discard and navigation guards), and
`a11y:check` (0 automated violations, settings picker included).
