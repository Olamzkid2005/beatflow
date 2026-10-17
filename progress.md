# BeatFlow review and repair progress

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
