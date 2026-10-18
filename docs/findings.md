# BeatFlow — current codebase audit and targeted follow-up

Reviewed: **18 October 2026**

Source baseline: **`5eaaf24`**, clean before the review

Verdict: **sound architecture, but not finished or ready for dependable end-to-end publishing**.

This report consolidates the fresh codebase review and a second targeted check of previously untested edges. It supersedes this file's old pre-renderer assessment: the renderer, presets, settings, IndexedDB history, and regression suite now exist. Historical claims that these are missing, that public sessions expose access tokens, or that zod is undeclared do **not** describe the current source.

## Scope and evidence

- Reviewed application pages/components, authentication, YouTube routes/helpers, renderer/assets/templates, browser storage, tests, probe, configuration, CI, and the build spec.
- First pass: production build and UI checks in real Chrome, with synthetic owner credentials and mocked YouTube boundaries; actual rendering and media inspection; isolated actual-source checks.
- Targeted follow-up: real Chrome executing the actual TypeScript modules through a temporary local transpilation server; actual IndexedDB transaction abort, actual browser encoders, self-hosted fonts and canvas measurements, runtime template validation/snapshot checks; synthetic concurrent Auth.js refresh requests.
- At the time of the October audit, no application fixes, dependency changes, deployment, real OAuth, Google calls, or uploads were performed; the only artifact then delivered by that audit was this Markdown report. This records that review snapshot, not later repository work.
- **Confirmed** means reproduced or directly established from current code. **Conditional risk** means an explicit dependency/failure scenario was simulated; it is not a claim that it occurred against Google. **Spec gap** means a required behavior is absent or the measured artifact differs.
- Priorities: **P1** = address before relying on the publishing workflow; **P2** = correctness, format, resilience, or API-contract work for v1; **P3** = hardening/maintainability.

## Findings at a glance

| ID | Priority | Finding | Evidence | Pass |
| --- | --- | --- | --- | --- |
| F01 | P1 | Recovery can attach an unrelated video's ID to the current attempt | Actual-source reproduction | Fresh review |
| F02 | P1 | Generated artifact ownership is split between render and upload state | Production Chrome UI | Fresh review |
| F03 | P1 | Internal navigation silently aborts active work | Production Chrome UI | Fresh review |
| F04 | P1 | Default schedule uses browser time but saved-zone interpretation | Chrome UI + actual helper | Fresh review |
| F05 | P1 | Legacy history is deleted even when migration fails | Actual-source failure injection | Fresh review |
| F06 | P2 | IndexedDB writes resolve before transaction commit | Real Chrome IndexedDB abort | **Targeted follow-up** |
| F07 | P2 | Long titles overlap branding and can clip outside the frame | Actual fonts + canvas bounds | **Targeted follow-up** |
| F08 | P2 | Invalid FPS can produce an audio-only `video/mp4` result | Actual encoder + media readback | **Targeted follow-up** |
| F09 | P2 | Render boundary neither validates nor snapshots its input | Actual `renderVideo()` calls | **Targeted follow-up** |
| F10 | P2 | Failed partial uploads are labeled complete | Production Chrome UI | Fresh review |
| F11 | P2 | Track defaults and upload metadata become stale | Production Chrome UI | Fresh review |
| F12 | P2 | Storage denial can crash initialization or silently lose history | Actual-source reproduction + inspection | Fresh review |
| F13 | P2 | Abort during audio encoding does not stop finalization | Controlled encoder-boundary reproduction | Fresh review |
| F14 | P2 | Output uses sRGB transfer, not full BT.709 signalling | Container and H.264 SPS inspection | Fresh review |
| F15 | P2 | Immediate public/unlisted visibility is not editable | Source/UI inspection; spec gap | Fresh review |
| F16 | P2 | Parallel refresh responses can overwrite successful rotated credentials | Synthetic Auth.js requests; conditional risk | **Targeted follow-up** |

## Detailed findings

### F01 — Recovery can report the wrong upload as successful

**References:** `lib/youtube/reconcile.ts:69–83`; `app/(app)/generate/page.tsx:281–309`.

The matcher normalizes the title, accepts any matching upload after `notBefore - 120 seconds`, and returns the newest one. There is no attempt identifier or upper time bound. The UI treats the match as success and stores the current attempt's requested privacy/schedule against that ID.

**Reproduction:** attempt starts at `2026-10-18T12:00:00Z`; the only playlist candidate has the same title and timestamp `2026-10-18T11:59:00Z`. The function returns that unrelated earlier video's ID. Later same-title uploads can also match because there is no upper bound.

**Impact:** false success, wrong history links, misleading scheduling records, and uncertainty about whether retrying creates a duplicate. The comment that recovery “never guesses” is inaccurate.

**Recommendation:** prefer querying the retained resumable session. If playlist matching is necessary, show candidates and require confirmation; reject ambiguity and do not infer actual privacy, processing, or schedule from the attempted request.

### F02 — Render and upload state disagree about which artifact exists

**References:** `components/render-studio.tsx:198–224`; `components/render-studio.tsx:273–275`; `app/(app)/generate/page.tsx:355`.

`Use for upload` constructs a `File` held in the parent. Discard/new-render cleanup clears the renderer's URL/Blob only; it cannot clear the parent's selected upload file. The renderer receives no upload-busy state.

**Production UI reproduction:** render → Use for upload → Discard removes the video preview but leaves the old MP4 selected for upload. During a held upload, Render MP4, Use for upload, and Discard are all enabled. A later handoff can change the desk's displayed selection while the upload closure still sends the previous file.

**Impact:** stale video selection, retained media despite the “released from memory” message, and controls that misrepresent the active operation. This is not proof that every `File` construction physically copies its bytes; the confirmed issue is retained ownership/reference state.

**Recommendation:** one owner for the generated artifact and coordinated upload state; invalidate the matching upload selection on discard/replacement and gate conflicting actions with appropriate confirmation.

### F03 — Internal navigation silently cancels render/upload work

**References:** `lib/use-before-unload.ts:11–18`; `components/nav-links.tsx:28–39`; `components/render-studio.tsx:182–193`; `app/(app)/generate/page.tsx:142–146`.

`beforeunload` covers document unload, not normal Next.js client navigation. Both jobs are aborted during component unmount.

**Production UI reproduction:** start a render; click History while `Rendering…` is visible. The route changes to `/history` with **zero confirmation calls**. Upload has the same unmount-abort lifecycle, though that navigation case was established by code rather than separately replayed.

**Recommendation:** guard internal navigation/sign-out and browser history changes while work is active, or keep active jobs in a persistent owner above page navigation. Preserve honest messaging that aborting local upload work does not delete a video Google already accepted.

### F04 — Default scheduling is wrong when saved and browser zones differ

**References:** `app/(app)/generate/page.tsx:54–55`; `app/(app)/generate/page.tsx:118–128`; `lib/time.ts:82–87`.

The initial datetime is formatted with the browser's local getters, then submitted as wall time in the saved producer timezone.

**Reproduction using the actual helpers:** an intended instant of `2026-10-18T12:00:00Z` formats to `2026-10-18T08:00` in New York. Interpreted as Tokyo time, it becomes `2026-10-17T23:00:00Z`—13 hours earlier. Chrome also confirmed the date field used browser time while its hint said `Asia/Tokyo`.

**Impact:** rejected defaults or an unintended future publish time. Manually entering the desired wall time in the displayed zone is a workaround, not a fix.

**Recommendation:** resolve the working zone first; format `now + 10 minutes` in that zone. Show a UTC/local confirmation and test differing zones plus date boundaries. Existing strict DST conversion is useful and should be retained.

### F05 — A failed migration deletes legacy history

**References:** `lib/history-store.ts:87–97`.

Migration sets `migrated = true` before success and clears the legacy store in `finally`. A failed IndexedDB read/write still deletes the only pre-migration copy and prevents retry in that controller instance.

**Reproduction:** injected a backend whose `list()` throws `IndexedDB unavailable`; migration rejected and `legacy.clear()` still ran.

**Recommendation:** preserve the legacy key until every migrated row is durably committed, then mark success. Share an in-flight migration promise for concurrent callers. Decide explicitly how to merge legacy rows when IndexedDB already contains entries instead of silently dropping them.

### F06 — New: IndexedDB reports write success before durable commit

**References:** `lib/history-store.ts:164–176`; `lib/history-store.ts:182–183`; `lib/history-store.ts:196–197`.

The transaction helper resolves on `request.onsuccess`, not `tx.oncomplete`. A request can succeed while its transaction later aborts. Once resolved, the promise cannot be rejected by `tx.onabort`.

**Real Chrome reproduction:** attached a listener to a real `put` request and aborted its transaction when the request reported success. Observed event order:

```text
request-success
put-promise-fulfilled
transaction-abort
```

`await backend.put(...)` fulfilled, but a subsequent read returned `[]`: the entry never committed. The same helper serves `clear()`.

**Recommendation:** capture the request result, resolve only on transaction completion, and reject request/transaction failures. Test post-request abort for both put and clear. This also matters to safe migration: a fulfilled put is currently insufficient evidence to delete legacy data.

### F07 — New: long titles overlap branding and clip vertically

**References:** `lib/renderer/scene.ts:195–207`; `lib/renderer/scene.ts:228–237`; `lib/templates/first-light.ts:45–74`; `lib/templates/pulse.ts:45–74`; `tests/renderer.test.mjs:58–84`.

Layout only constrains width and line count. It does not reserve vertical space for branding or frame boundaries. The existing test uses an approximate measure function and checks horizontal widths, so it cannot detect this.

**Real-font Chrome reproduction:** rendered the following editable track title with the shipped Inter/JetBrains Mono fonts and `PRODUCER BRAND`:

```text
Midnight Loop Extended Visualizer Version Featuring A Guest Verse And A Very Long Name That Keeps Going
```

Measured actual glyph bounds:

| Preset | Title result | Brand bounds | Defect |
| --- | --- | --- | --- |
| First Light | Three lines at 88 px; second line y≈899.9–986.4; third ends y≈1083.4 | y≈957.0–979.5 | Second line overlaps branding; third line extends beyond the 1080 px frame |
| Pulse | Three lines at 76 px; third line y≈640.0–715.2 | y≈664.9–685.9 | Third line overlaps centered branding |

The long track-name input has no 100-character title restriction; this is a reachable renderer case, not an invalid YouTube-title test. The overlap occurs horizontally as well as vertically in these compositions.

**Recommendation:** fit text within a bounding rectangle, reserving brand space; reduce size/line count or reposition branding. Add real-font visual/bounds regressions for all presets, including 2–3-line titles and long producer names.

### F08 — New: invalid FPS silently returns audio-only MP4s

**References:** `lib/renderer/encode.ts:28–34`; `lib/renderer/encode.ts:54–67`; `lib/renderer/index.ts:101–106`.

`fps` is a public numeric option but is not checked for finite positive values before resource allocation/encoding.

**Actual Chrome encoder reproduction** using 0.1 seconds of stereo audio:

| FPS | Observed result |
| --- | --- |
| `0` | Downstream `TypeError: timestamp must be a finite number` |
| `-1` | Resolved 698-byte `video/mp4`; no video track; audio track present |
| `NaN` | Resolved 698-byte `video/mp4`; no video track; audio track present |
| `Infinity` | Resolved 698-byte `video/mp4`; no video track; audio track present |

Track presence was checked by reopening each result through Mediabunny, not inferred solely from the byte count. The current UI always uses the default FPS; this is a public-engine contract defect, not a currently exposed FPS form control.

**Recommendation:** reject nonfinite/nonpositive FPS before constructing the encoder, consider a documented upper bound, and validate that successful output contains the required tracks. Test supported positive FPS separately.

### F09 — New: public render input is neither validated nor snapshotted

**References:** `lib/renderer/index.ts:68–106`; `lib/renderer/template-schema.ts:83–107`.

Presets are parsed at module load, but `renderVideo()` trusts its TypeScript `Template` parameter at runtime and keeps reading mutable input objects across awaits. Its current caller uses fixed presets and disables editing during render; that reduces UI exposure but does not fulfill the reusable engine's boundary guarantees.

**Actual engine reproductions in Chrome:**

1. Set `schemaVersion: 999` on an otherwise valid preset and call `renderVideo()`: it resolved a 13,239-byte MP4 instead of rejecting the version.
2. Mutate the passed template's text value in the decode progress callback: exported scene drawing used `Mutated template`, not the original value. The render therefore does not take an immutable snapshot.
3. The schema accepts `1919 × 1079` dimensions despite the specified even 1920×1080 output contract. This was a schema acceptance check, not a claim that those dimensions encoded successfully.

**Recommendation:** parse/clone the template and copy variables at entry, validate output dimensions and FPS, and expose configurable duration limits deliberately. Keep editor-schema flexibility separate from export-format restrictions if needed.

The implemented progress callback accepts `{ stage, pct }` and allows omitted options; the spec illustrates `(stage, pct)` with required cancellation/progress options. Current call sites agree with the implementation, so this is not an observed runtime failure, but the public contract should be reconciled/documented.

### F10 — A failed partial upload is labeled complete

**References:** `app/(app)/generate/page.tsx:516–537`.

The progress card switches to “Upload complete” and “Handed off” whenever `busy` is false, including after an error that leaves progress populated.

**Production UI reproduction:** first 256 KiB chunk acknowledged by a 308 Range response, next request fails with HTTP 400. UI simultaneously shows the failure, **50%**, **Upload complete**, and **Handed off**.

**Recommendation:** distinguish uploading, complete, failed, cancelled, and unknown outcome. Only a confirmed video result should display completion/handoff language.

### F11 — Track identity and upload defaults become stale

**References:** `components/render-studio.tsx:139–145`; `app/(app)/generate/page.tsx:48–49`; `app/(app)/generate/page.tsx:113–116`; `app/(app)/generate/page.tsx:355`.

**Production UI reproductions:**

- Select `First_Track.mp3`, then `Second_Track.mp3`: the selected audio changes, but the track name remains `First Track`.
- Render and hand off a track: YouTube title remains `BeatFlow M0 test — 5 seconds`; an empty starting description falls back to `M0 pipeline proof for BeatFlow.`

**Recommendation:** distinguish untouched automatic defaults from user edits, update filename-derived fields for new sources, and offer an intentional title handoff. Do not publish demo metadata by default or overwrite a deliberately edited title.

### F12 — Storage denial can crash initialization or silently lose history

**References:** `lib/settings.ts:20–29`; `lib/history.ts:23–29`; `lib/history.ts:53–68`; `app/(app)/settings/page.tsx:113–119`; `app/(app)/history/page.tsx:74–78`.

- `readSettings()` obtains `window.localStorage` outside its `try`. A getter throwing `SecurityError` escapes. This was reproduced with an injected throwing getter; both settings and studio initialize state through this reader.
- The history fallback catches adapter construction, not asynchronous IndexedDB open failures. Later errors are hidden as an empty list or swallowed add, so the advertised memory fallback does not cover that case.
- Reset/clear UI paths do not catch storage errors; history is optimistically emptied before clearing succeeds. These are source-established failure paths, not separately replayed browser scenarios.

**Recommendation:** catch storage acquisition, handle asynchronous backend failure and retry/fallback explicitly, preserve a successful upload receipt, and show a nonfatal “not saved locally” warning. Do not turn persistence failure into false upload failure, but do not hide it either.

### F13 — Audio-phase cancellation does not stop finalization

**References:** `lib/renderer/encode.ts:70–80`; `components/render-studio.tsx:246–247`.

After the last pre-audio abort check, the encoder awaits the entire `audioSource.add()`, closes sources, finalizes, and returns without another signal check or an abort-triggered output cancellation.

**Controlled reproduction:** held the audio-add boundary, aborted, then released it. `output.cancel()` was not invoked; finalization ran and the encoder resolved. This used mocked encoder operations to isolate control flow, not a measured long-track cancellation delay. The UI's post-render check prevents displaying the cancelled output, but does not stop the work.

**Recommendation:** propagate cancellation to the output during cancellable work, check the signal after each long await and before return, and test cancellation in decode, video, audio, and finalize with honest limitations for non-abortable browser APIs.

### F14 — Output does not strictly satisfy BT.709 transfer signalling

**References:** `lib/renderer/encode.ts:41–46`; `tools/m0-probe/mp4.mjs:14–54`.

A freshly UI-rendered artifact and the fresh probe output both had:

```text
H.264 profile_idc = 100 (High), level_idc = 40
chroma_format_idc = 1 (4:2:0), frame_mbs_only_flag = 1 (progressive)
colr/nclx: primaries = 1, transfer = 13, matrix = 1, full range
SPS VUI:   primaries = 1, transfer = 13, matrix = 1, full range
```

Transfer 13 is sRGB/IEC 61966-2-1, not BT.709 transfer 1. Both container and bitstream agree. The issue is not missing progressive/chroma evidence; those properties were inspected and passed. SPS storage includes normal 1088-line macroblock padding with a 1080-line display crop.

**Recommendation:** implement/verify correct color conversion and signalling rather than merely relabeling the output. Assert profile, chroma, progressive flags and color in media tests. This mismatch does not establish broken playback or YouTube rejection.

### F15 — Visibility is not editable as specified

**References:** `app/(app)/generate/page.tsx:190–206`; `app/(app)/generate/page.tsx:707–720`.

The form chooses private when scheduled and unlisted otherwise. It has no public/unlisted selector for immediate publishing, although the product requires per-upload visibility editing.

**Recommendation:** add explicit immediate visibility selection, force scheduled uploads private, and verify both UI requests and server validation.

### F16 — New: concurrent refresh can overwrite successfully rotated credentials

**References:** `auth.ts:11–51`; `auth.ts:72–78`.

Every request with an expired cookie refreshes independently. There is no in-flight coordination; both successful and failed refresh results can set a new session cookie.

**Synthetic Auth.js reproduction:** sent two concurrent requests with the same expired owner cookie. Mock token endpoint accepted the first and rotated its refresh token, then returned `invalid_grant` for the second. Observed:

```text
refreshCalls: 2
response 1: owner authorized, access token present, rotated refresh token retained
response 2: guard 401, RefreshAccessTokenError, no access token, old refresh token retained
```

If the second cookie is processed last, it can replace the successful cookie. **Conditional risk:** this proves the code's behavior under rotation/rejection, not that Google currently rejects parallel refreshes or rotates on every refresh. Multiple tabs/requests and the actual deployed provider behavior need verification.

**Recommendation:** define a refresh concurrency strategy consistent with stateless sessions and deployment topology; in-process single-flight alone does not coordinate separate serverless instances. Avoid adding a database/cache merely for this review. Add concurrent-response regression tests and record actual Google behavior before choosing a larger solution.

## Additional hardening and improvement areas

These are not presented as additional demonstrated production failures:

- **Verified email:** `auth.config.ts:33–34` accepts an exact owner email even when a synthetic profile has `email_verified: false`. Require Google's verified-email assertion for email-based authorization. No forged Google identity or actual owner-gate exploit was demonstrated.
- **Input resource budget:** `lib/renderer/assets.ts:53–70` fully decodes a photo before downscaling; there is no explicit image pixel limit. `lib/renderer/audio.ts:24–34` rejects overlong audio only after full decoding. Full decoded 48 kHz stereo Float32 audio alone is roughly 220 MiB for ten minutes; image/canvas/encoder/output buffers overlap. Define target-device peak memory and wall-time budgets and reject safely where possible. No new speedup or memory-growth claim is made.
- **Audio bitrate contract:** the requested bitrate is a VBR target, not proof of encoded 256–320 kbps on every input. Resolve whether the spec means a target or strict rate; test representative music before choosing constant mode.
- **History truthfulness:** `lib/history.ts:78–81` marks a passed schedule “published” based solely on time. It does not verify processing, publication, deletion, or changed privacy on YouTube. Label it inferred or fetch actual status. Validate stored dates/enums too; current row validation only checks their types.
- **IndexedDB lifecycle:** handle failed-open retries, blocked upgrades and version changes; consider BroadcastChannel or another intentional mechanism for cross-tab history updates. IndexedDB writes do not emit localStorage `storage` events.
- **Accessibility:** native radio controls or complete radio-group keyboard behavior would improve the template picker (`components/render-studio.tsx:404–435`). Connect field errors/hints with `aria-describedby` and mark invalid fields. This was an inspection, not a full WCAG audit.
- **Maintainability:** extract upload orchestration/state from the 823-line page; retain the useful React-free renderer and pure validation/time/storage helpers. A broad rewrite or hosted render infrastructure is not justified.
- **Documentation/status:** remove M0-only demo instructions and contradictory readiness copy. Keep deployment-dependent gates separate from locally implemented features.

## What is working well

- Owner checks exist in proxy, rendered-page guard, and every YouTube route; missing owner configuration fails closed.
- Public sessions omit access and refresh credentials. Route wrappers persist refreshed cookies; refresh failures reject stale credentials.
- Media goes directly from browser to Google, not through a Vercel body-limited route.
- Uploader uses server-confirmed offsets, bounded retries/backoff, status recovery, and cancellation propagation.
- Date conversion rejects invalid calendar dates and DST gaps/ambiguities instead of guessing.
- Shared scene drawing keeps preview/export composition aligned; self-hosted fonts and validated fixed presets are in place.
- Actual local rendering, output preview/download, audio preview, settings and IndexedDB history exist. These are not merely planned features.

## Verification record

### Existing checks from the fresh review

The following passed against the same unchanged application source. Only Markdown changes in this follow-up, so repeating these would not test different application bytes.

| Check | Result |
| --- | --- |
| `npm test` | **51/51 passed**, no failures or skips |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run build` | Passed, production routes generated |
| Production Chrome UI | Successful short render/handoff plus the explicitly listed negative scenarios reproduced |
| Fresh isolated `npm run m0:probe` | Required encode/decode/playback/MP4 assertions passed, Chrome 155.0.8059.80 |
| Fresh probe MP4 | 107,988 bytes; five 1080p frames at 1 fps; stereo AAC 48 kHz; 5.077 s; front moov; no edit list |
| Fresh UI MP4 | 52,927 bytes; two 1080p frames; stereo AAC 48 kHz; 2.069 s; front moov; no edit list |
| SPS + container inspection | High/progressive/4:2:0 confirmed; **strict BT.709 transfer requirement failed** |

### Targeted follow-up checks

| Check | Result and limit |
| --- | --- |
| Real IndexedDB request-success followed by abort | **Durability defect reproduced:** fulfilled put, zero committed rows |
| Actual encoder with `0`, `-1`, `NaN`, `Infinity` FPS | **Boundary defect reproduced:** zero fails downstream; other values return audio-only MP4s |
| Unsupported template version through `renderVideo()` | **Validation defect reproduced:** schema version 999 encoded |
| Template mutation after render began | **Snapshot defect reproduced:** mutated text reached export drawing |
| Long title with shipped fonts and canvas glyph bounds | **Layout defects reproduced:** First Light overlap/clipping; Pulse overlap |
| Concurrent expired-cookie Auth.js requests | **Conditional race reproduced** with synthetic token rotation/rejection; no Google request sent |
| Sign-in with synthetic unverified owner email | Callback accepted; hardening gap, not demonstrated exploit |

Targeted checks were isolated evidence checks, not committed regression tests. A successful reproduction command means the asserted defective behavior was observed, **not** that the corresponding feature passed acceptance. The initial browser harness attempt failed because its synthetic image canvas had no context; the harness was corrected, then the full final checks and assertions completed successfully without changing application code.

Temporary evidence from this review:

- `/tmp/beatflow-fresh-audit.mjs` — first-pass production UI reproduction harness.
- `/tmp/beatflow-fresh-audit.mp4` and `/tmp/beatflow-fresh-audit-probe/report.json` — first-pass artifact/codec evidence.
- `/tmp/beatflow-targeted-audit.mjs` — follow-up Chrome harness loading actual source modules.
- `/tmp/beatflow-targeted-audit.json` — full measured transaction, FPS/track, template and glyph-bound results.
- `/tmp/beatflow-targeted-audit.png` — follow-up canvas capture.

These temporary paths are local evidence, not durable checked-in test assets. The essential inputs/results are included above so this report does not depend on those files surviving. Temporary browsers/servers were stopped; no production service is required for these local reproductions.

### Not revalidated or still blocked on external acceptance

- Real owner OAuth flow, consent-screen status, canonical callback/deployment settings.
- Actual Google project quota; deployed-origin readable PUT/308/Range/status responses and interruption recovery without duplicates.
- YouTube processing and scheduled publication at the chosen FPS; manual upload of a production-rendered artifact.
- New 3-/10-minute render, representative music quality, five-render process/peak memory, older-laptop CPU/wall time, and VLC/ffprobe/MediaInfo validation. Historical measurements in `progress.md` are prior evidence, not new certification.
- Physical-device review, Edge-specific behavior, comprehensive accessibility/security testing.

## Recommended repair sequence and acceptance

1. **Publishing integrity:** F01–F05, F10–F12. Acceptance: no wrong-ID recovery, no stale upload selection or silent navigation loss, correct two-zone defaults, no false completion, no migration data loss.
2. **Storage and composition:** F06–F07. Acceptance: transaction abort rejects writes; long real-font titles/branding remain inside each preset's reserved regions.
3. **Engine contract and media:** F08–F09, F13–F15. Acceptance: invalid FPS/templates rejected before expensive work; immutable render inputs; cancellation coverage by stage; verified output tracks/color and editable visibility.
4. **Auth resilience:** F16 and verified-email hardening with tests. Decide any distributed coordination only from provider/deployment evidence and the project's no-extra-services constraint.
5. **Repeatable browser regressions and real deployed YouTube acceptance.** Preserve existing passing unit checks; add negative lifecycle/transaction/media tests rather than weakening assertions or relying only on build success.

**Bottom line:** retain the architecture. Finish the reproducible state, persistence, layout, scheduling and renderer-contract repairs, then complete deployed YouTube and target-device acceptance before describing v1 as done.

## Executor repair verification runbook — added 18 October 2026

The findings above remain an audit, **not a list of implemented repairs**. Later image/prototype work does not close them. Use these steps to produce reviewable fixes; mark each item PASS / FAIL / NOT RUN with evidence. Do not merely rename a finding to “resolved.”

### 1. Before each repair

1. Read `AGENTS.md`, relevant installed Next.js docs and the exact affected source/tests. Inspect `git status --short`; preserve unrelated edits and baseline probe media/report.
2. Select **one finding or tightly coupled group**. State authorized file paths, invariant to preserve, expected old failure and new outcome. Do not mix auth/storage/renderer refactors without need.
3. Add a native Node regression in the working tree where possible and a repeatable real-browser regression where browser APIs are involved. Observe the old failure (or clearly document why prior reproduction is no longer applicable) before claiming the repair. Do not create a git commit unless explicitly requested.
4. No production upload, publication, deployment, deletion, account provisioning or new service is authorized by this audit. Use synthetic credentials and mocked Google boundaries. Never include credentials in screenshots/logs/fixtures.

### 2. Finding-specific acceptance evidence

| Finding | Execute this scenario | Required result / evidence |
| --- | --- | --- |
| F01 — wrong-ID recovery | Current initialization/upload attempt fails; mocked latest-upload response contains an unrelated recent video. Also test a matching, provably owned attempt | Unrelated ID is never adopted. Keep outcome unknown unless identity is established. Assert IDs and state, not just status text. |
| F02 — artifact ownership | Render A, hand off A, begin mocked pending upload; finish/render/select B and try handoff/discard/replacement | Active upload keeps immutable A; conflicting handoff blocked. Confirm file identity/content/name and that discarding a render cannot leave a silent stale selection. |
| F03 — navigation loss | Start each active render/upload phase; click internal nav and browser back; separately test unload | Warning/explicit cancellation behaves as specified; stay keeps job alive; leave aborts and cleans owned resources. `beforeunload` alone does not pass internal navigation. |
| F04 — schedule zones | Use saved timezone different from browser; render page fresh and change zones. Include DST gap and fold fixtures | Displayed wall time and server UTC conversion agree; nonexistent/ambiguous times reject. Run at least two browser zones; no hydration mismatch. |
| F05 — legacy migration | Seed old local history; inject IndexedDB open/write/commit failure, then retry successfully | Legacy data remains after failure and migrates idempotently after success; old source removed only after durable commit. Assert actual rows/storage, not only a fulfilled Promise. |
| F06 — transaction durability | In real IndexedDB, abort the transaction **after request success**; also test successful transaction | Failed write rejects; no false saved state or committed row. Successful write resolves only on `tx.oncomplete`. Database reopen confirms durability. |
| F07 — typography | Wait for actual self-hosted fonts. Test every built-in with short/long/unbroken/Unicode title and long/missing producer | Actual glyph/effect bounds fit reserved x/y/width/height; no title-brand collision or frame clipping. Test minimum-size ellipsis, multiline vertical bounds and deliberate too-small-box error. Fake-width Node tests alone are insufficient. |
| F08 — FPS | Call both render/encoder boundaries with `0`, `-1`, `NaN`, `Infinity` and unsupported FPS; also valid static/animated profiles | Invalid values reject before decode/encode work; valid downloaded MP4 contains nonzero video **and** audio tracks at selected rate. Do not accept audio-only `video/mp4`. |
| F09 — template validation/snapshot | Supply unknown version/field/binding, bad geometry, then mutate original template/vars immediately after job starts | Invalid data rejects before expensive work; mutation cannot change captured frames. Verify object/array/vars detachment and exact selected File references. |
| F10 — partial history | Mock failed/interrupted upload with partial bytes and unknown outcome; reload history | UI never labels it fully uploaded/complete. Distinguish pending/failed/unknown from confirmed success and preserve recoverable attempt context. |
| F11 — defaults staleness | Change saved producer/defaults and choose another track after prior render/handoff; test metadata overrides | New draft defaults update intentionally; explicit user edits preserved; current artifact and upload metadata remain bound to the right release. |
| F12 — unavailable storage | Deny IndexedDB/local storage, trigger quota/write failure and blocked upgrade/open retry | No page crash or silent durable-save claim; actionable error; draft stays usable; retry succeeds when available. Do not erase prior records. |
| F13 — cancellation | Cancel at capabilities/decode/assets/video/audio awaits and immediately before finalization, including delayed mocks. Separately abort once finalization has begun. | Before finalize starts, cancel output, release resources and return cancellation without late success/handoff. If finalization is no longer interruptible, document/test that commit boundary: do not claim cancellation or hand off partial output; report a valid completed artifact honestly if commit won the race. No unhandled callback errors; discard stale decode results. |
| F14 — media color/format | Fresh real MP4 with actual settings; inspect container and bitstream color metadata plus decoded playback | Compare against original required BT.709 transfer/primaries/matrix, progressive/4:2:0, AAC, front moov and edit-list requirements. Current historical transfer mismatch stays open until corrected/retested or owner explicitly changes the requirement. |
| F15 — upload visibility | Choose immediate public and immediate unlisted uploads, then enable scheduling; inspect actual mocked init-upload JSON and server validation | Explicit immediate privacy choice reaches the API; scheduled uploads are forced private; invalid schedule/privacy combinations reject. This is YouTube publishing privacy, **not** message-layer visibility. |
| F16 — auth race | Two concurrent expired-cookie requests with synthetic provider rotation and stale rejection/success; test cookie persistence | A stale failure cannot erase a valid refresh result; credentials never enter public session; response cookies persist. Provider/distributed behavior not proven by a mock remains an explicit limitation. |
| Email-verification hardening | Synthetic owner-email claim with `email_verified: false`, then verified matching owner and verified non-owner | Reject unverified/non-owner without exposing tokens; verified owner path passes. Confirm trust assumptions/provider field, do not authorize users from a UI-only check. |

**Dependency/order:** fix and verify F06 transaction durability before accepting F05 migration safety (or implement them together against the same transaction-completion promise). Otherwise migration can still delete its legacy source after a request succeeded but the transaction aborted. F13 cancellation needs an explicit finalization/commit boundary, not an assumed ability to interrupt every browser/library operation.

Before implementing any row, re-read its full finding above. This table is an execution aid, not permission to substitute a different requirement or claim the original reproduction has become a green acceptance test.

### 3. Command gate after final source edits

Run independently from repo root and record each exit code:

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
M0_OUTPUT_DIR="$(mktemp -d /tmp/beatflow-m0-review.XXXXXX)" npm run m0:probe
```

- Preserve the tested command's status if filtering output (`set -o pipefail`); inspect failure output. Earlier passes do not cover later source edits.
- `npm test` counts can grow; require zero failures/skips for affected regressions, not a hard-coded old total. Do not delete tests, weaken assertions, catch-and-ignore errors or add type/lint suppressions to hide failures.
- The probe certifies its own short baseline artifact only. It does not certify animated Orbital, real MP3/music quality, long-track memory or Google production behavior.
- Start production server with `npm run start -- --hostname 127.0.0.1 --port 3128` as a managed background service, wait for ready, inspect logs and run the real affected UI/API scenario with mocked external boundaries. Do not connect to or reset the owner's real session/data.

### 4. Review packet required from executor

Return the following **with paths to durable evidence**, not a vague “all good”:

```text
Scope / finding IDs:
Baseline commit + pre-existing changed paths:
Changed source/tests/docs:
Before-fix failing case + observed output:
After-fix test names, exact commands and exit codes:
Browser version / OS / timezone(s) / hardware:
UI steps + screenshots / console and network failures:
Downloaded media path + SHA-256 + track/timestamp/color inspection:
Storage/async/cancellation failure-injection results:
Performance inputs / wall time / CPU / process peak memory (or NOT RUN):
External acceptance not run / remaining risks:
Processes/resources created and cleanup result:
```

Use synthetic, nonsecret fixtures; do not check real media/PII/tokens into evidence. Review the staged/unstaged diff for unrelated files and secrets. Never commit or push unless asked.

### 5. Stop conditions and reviewer use

Stop on failing required tests, lost legacy data, wrong video ID, false saved/uploaded state, invalid/audio-only MP4, leaked credentials, unexplained timestamp drift, stale job mutation or limits exceeded. Fix the proven cause and rerun affected checks; if blocked, report the failing gate and missing requirement. Do not silently change the product requirement, invent a performance result or declare production Google acceptance from mocked tests.

For future template/Orbital implementation, also follow **`docs/template-system-design.md`, sections 13–14**. The static asset pack and isolated simulated prototype are visual-review aids, not evidence that any production audit finding is fixed.

## Repair log

Append-only. A repair is listed only with the evidence from this runbook; findings without an entry remain open.

### F06 — IndexedDB writes wait for transaction commit — **PASS**, 18 October 2026

`lib/history-store.ts` now resolves `put`, `clear`, `remove` and `list` from `tx.oncomplete`, captures the request result separately, and rejects on request error or `tx.onabort`. Request errors call `preventDefault()` so the request's own failure is reported instead of a generic abort.

- `tests/history.test.mjs`: three new tests cover a committed write/clear, a write aborted after request success (rejects, zero rows), and aborted clear/remove retaining the stored row. Full history file: **10/10 passed**.
- `npm run idb:check` (real Chrome 155.0.8059.80, real IndexedDB): aborted `put`, `clear` and `remove` all reject with nothing changed; a committed write is visible after reopening the database; aborting did not throw. This reproduces the exact request-success-then-abort ordering from the finding.
- Node tests use a minimal fake that also rolls back on abort; its ordering is a model, not proof of browser semantics. The Chrome check is the authoritative evidence.

**Still open:** F05 at the time of this entry (fixed below). Larger memory/performance and deployed-Google gates are unaffected.

### F05 — Failed migration keeps legacy history — **PASS**, 18 October 2026

Migration now reads the legacy rows, skips IDs already present, writes the rest through the durable backend, and calls `legacy.clear()` only after every write resolves. The legacy key stays on failure, and an in-flight promise plus a `migrated` flag make success once-only while allowing a retry after rejection. Existing IndexedDB rows win over a legacy row with the same video ID, so retries are idempotent.

- `tests/history.test.mjs`: failed write rejects, legacy remains and nothing is committed; retry copies both rows exactly once. Existing-store migration now merges instead of silently dropping legacy rows, and does not overwrite a newer stored row. History file: **11/11 passed**.
- `npm run idb:check` real Chrome: the migration's write is aborted after request success, `legacy.clear()` is not called, then the same controller retries successfully and clears exactly once.
- **Changed decision:** migration into a non-empty store now merges legacy entries rather than treating the store as authoritative and discarding the old copy. This follows the finding's requirement to decide explicitly instead of dropping data.

### F08/F09 — Render boundary validation and snapshot — **PASS for rejection/snapshot; media readback NOT RUN**, 18 October 2026

- New `lib/renderer/validate.ts` rejects nonfinite/nonpositive FPS outside 1–60, rejects odd/non-whole/oversized export dimensions, and deep-parses the template plus copies variables before any canvas or decoder allocation. `encodeMp4()` validates FPS and canvas dimensions independently of `renderVideo()`. Capability probing now uses the selected frame rate.
- Template/canvas/layer/shadow/outline objects are strict: unknown fields reject instead of being silently stripped by Zod.
- Tests: invalid FPS values and odd dimensions throw; mutation of the caller's template/vars after snapshot cannot change it; unknown fields reject. Full suite below.
- **Not yet verified:** a real 30 fps downloaded MP4 with nonzero video and audio tracks at the selected rate. The existing media probe is still the 1 fps baseline. This entry does not claim F08's output-track acceptance is closed.

### F07 — Text fits measured bounds with real fonts — **PASS**, 18 October 2026

- Text layers now support `maxHeight` and `lineHeight`; fitting checks both width and reserved height, clips line count by height, ellipsizes inside both, and throws when even one line cannot fit rather than drawing outside the box. Built-in titles/branding declare non-overlapping reserved heights before the frame edge.
- `tests/renderer.test.mjs` checks every preset for width, line count, `lines × lineHeight <= maxHeight`, frame bounds and title/brand separation.
- `npm run text:check` (Chrome 155.0.8059.80, shipped Inter/JetBrains Mono via `FontFace` + real `measureText`): **15/15 layouts** for long, unbroken and accented titles plus long/missing branding across all three presets fit both axes. Tightest: Pulse title 190/190 px tall and 1186/1360 px wide; Grid brand 52/60 px tall. A 10 px box rejects.
- The harness initially measured with unloaded family names and fell back to system fonts; that produced false failures. It now measures with the loaded faces. Automated bounds are not a full visual-design review.

### F02/F03 — Artifact ownership and internal navigation — **PASS for pure lifecycle logic; full in-flight UI replay NOT RUN**, 18 October 2026

- New `lib/artifact-ownership.ts` gives one selection owner. Rendered files carry an artifact ID; discarding/replacing that render clears only a matching upload selection, never a manually chosen file. Render controls, template/audio/image inputs and handoff/discard lock during an upload.
- New `lib/navigation-guard.ts` + app-shell `NavigationGuard` intercept internal anchor clicks in the capture phase and ask before leaving while a render or upload is active. `useNavigationGuard` registers in `RenderStudio` (render) and the upload page (upload).
- Tests: manual vs rendered ownership, nonmatching release, replacement identity, upload lock, declined/accepted prompts, guard release and reason ordering.
- **Not yet verified:** a full production-Chrome replay of render → handoff → held upload → second render/discard, and browser **back-button** interception. Next's client router processes `popstate`; link-click protection alone does not cover it. Both remain explicit gaps.
