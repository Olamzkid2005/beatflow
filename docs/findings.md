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

| ID | Status | Priority | Finding | Evidence | Pass |
| --- | --- | --- | --- | --- | --- |
| F01 | **Done** | P1 | Recovery can attach an unrelated video's ID to the current attempt | Actual-source reproduction | Fresh review |
| F02 | **Done** | P1 | Generated artifact ownership is split between render and upload state | Production Chrome UI | Fresh review |
| F03 | **Done** | P1 | Internal navigation silently aborts active work | Production Chrome UI | Fresh review |
| F04 | **Done** | P1 | Default schedule uses browser time but saved-zone interpretation | Chrome UI + actual helper | Fresh review |
| F05 | **Done** | P1 | Legacy history is deleted even when migration fails | Actual-source failure injection | Fresh review |
| F06 | **Done** | P2 | IndexedDB writes resolve before transaction commit | Real Chrome IndexedDB abort | **Targeted follow-up** |
| F07 | **Done** | P2 | Long titles overlap branding and can clip outside the frame | Actual fonts + canvas bounds | **Targeted follow-up** |
| F08 | **Done** | P2 | Invalid FPS can produce an audio-only `video/mp4` result | Actual encoder + media readback | **Targeted follow-up** |
| F09 | **Done** | P2 | Render boundary neither validates nor snapshots its input | Actual `renderVideo()` calls | **Targeted follow-up** |
| F10 | **Done** | P2 | Failed partial uploads are labeled complete | Production Chrome UI | Fresh review |
| F11 | **Done** | P2 | Track defaults and upload metadata become stale | Production Chrome UI | Fresh review |
| F12 | **Done** | P2 | Storage denial can crash initialization or silently lose history | Actual-source reproduction + inspection | Fresh review |
| F13 | **Done** | P2 | Abort during audio encoding does not stop finalization | Controlled encoder-boundary reproduction | Fresh review |
| F14 | Open — blocked | P2 | Output uses sRGB transfer, not full BT.709 signalling | Container and H.264 SPS inspection | Fresh review |
| F15 | **Done** | P2 | Immediate public/unlisted visibility is not editable | Source/UI inspection; spec gap | Fresh review |
| F16 | **Done** | P2 | Parallel refresh responses can overwrite successful rotated credentials | Synthetic Auth.js requests; conditional risk | **Targeted follow-up** |

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
- **Input resource budget:** `lib/renderer/assets.ts:53–70` fully decodes a photo before downscaling; there is no explicit image pixel limit. `lib/renderer/audio.ts:24–34` rejects overlong audio only after full decoding. Full decoded 48 kHz stereo Float32 audio alone is roughly 220 MiB for ten minutes; image/canvas/encoder/output buffers overlap. Define target-device peak memory and wall-time budgets and reject safely where possible. No new speedup or memory-growth claim is made. **Repaired 18 October 2026** — header pixel cap and pre-decode duration/size caps; peak measured at 1067 MiB renderer for a 5-minute beat; see below.
- **Audio bitrate contract:** the requested bitrate is a VBR target, not proof of encoded 256–320 kbps on every input. Resolve whether the spec means a target or strict rate; test representative music before choosing constant mode. **Decided 18 October 2026** — 288 kbps VBR target, measured 290 kbps on dense stereo; see below.
- **History truthfulness:** `lib/history.ts:78–81` marks a passed schedule “published” based solely on time. It does not verify processing, publication, deletion, or changed privacy on YouTube. Label it inferred or fetch actual status. Validate stored dates/enums too; current row validation only checks their types. **Repaired 18 October 2026** — explicit `videos.list` status refresh; see below.
- **IndexedDB lifecycle:** handle failed-open retries, blocked upgrades and version changes; consider BroadcastChannel or another intentional mechanism for cross-tab history updates. IndexedDB writes do not emit localStorage `storage` events. **Repaired 18 October 2026** — blocked-upgrade and cross-tab replay now pass; see below.
- **Accessibility:** native radio controls or complete radio-group keyboard behavior would improve the template picker (`components/render-studio.tsx:404–435`). Connect field errors/hints with `aria-describedby` and mark invalid fields. This was an inspection, not a full WCAG audit. **Named issues repaired and audited 18 October 2026** — axe WCAG A/AA and 2.2 AA pass; manual screen-reader/assistive-tech testing remains open.
- **Maintainability:** extract upload orchestration/state from the 823-line page; retain the useful React-free renderer and pure validation/time/storage helpers. A broad rewrite or hosted render infrastructure is not justified. **Repaired 18 October 2026** — `lib/use-upload-job.ts`; the page is 815 lines.
- **Documentation/status:** remove M0-only demo instructions and contradictory readiness copy. Keep deployment-dependent gates separate from locally implemented features. **Repaired 18 October 2026.**

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

### F08/F09 — Render boundary validation and snapshot — **PASS**, 18 October 2026

- New `lib/renderer/validate.ts` rejects nonfinite/nonpositive FPS outside 1–60, rejects odd/non-whole/oversized export dimensions, and deep-parses the template plus copies variables before any canvas or decoder allocation. `encodeMp4()` validates FPS and canvas dimensions independently of `renderVideo()`. Capability probing now uses the selected frame rate.
- Template/canvas/layer/shadow/outline objects are strict: unknown fields reject instead of being silently stripped by Zod.
- Tests: invalid FPS values and odd dimensions throw; mutation of the caller's template/vars after snapshot cannot change it; unknown fields reject. Full suite below.
- `npm run fps:check` (Chrome 155.0.8059.80) now runs the shipped encoder against a real 2-second 30 fps export and reads the blob back through Mediabunny: **avc + aac**, 1920×1080, 48 kHz stereo, **60 video packets at 30 fps**, 2.00 s duration. `NaN` FPS rejects before encoding. The test disables the real capability module only to pin encoder settings; FPS/dimension validation is the shipped `lib/renderer/validate.ts`.

### F07 — Text fits measured bounds with real fonts — **PASS**, 18 October 2026

- Text layers now support `maxHeight` and `lineHeight`; fitting checks both width and reserved height, clips line count by height, ellipsizes inside both, and throws when even one line cannot fit rather than drawing outside the box. Built-in titles/branding declare non-overlapping reserved heights before the frame edge.
- `tests/renderer.test.mjs` checks every preset for width, line count, `lines × lineHeight <= maxHeight`, frame bounds and title/brand separation.
- `npm run text:check` (Chrome 155.0.8059.80, shipped Inter/JetBrains Mono via `FontFace` + real `measureText`): **15/15 layouts** for long, unbroken and accented titles plus long/missing branding across all three presets fit both axes. Tightest: Pulse title 190/190 px tall and 1186/1360 px wide; Grid brand 52/60 px tall. A 10 px box rejects.
- The harness initially measured with unloaded family names and fell back to system fonts; that produced false failures. It now measures with the loaded faces. Automated bounds are not a full visual-design review.

### F02/F03 — Artifact ownership and internal navigation — **PASS**, 18 October 2026

- New `lib/artifact-ownership.ts` gives one selection owner. Rendered files carry an artifact ID; discarding/replacing that render clears only a matching upload selection, never a manually chosen file. Render controls, template/audio/image inputs and handoff/discard lock during an upload.
- New `lib/navigation-guard.ts` + app-shell `NavigationGuard` intercept internal anchor clicks in the capture phase and ask before leaving while a render or upload is active. `useNavigationGuard` registers in `RenderStudio` (render) and the upload page (upload).
- Tests: manual vs rendered ownership, nonmatching release, replacement identity, upload lock, declined/accepted prompts, guard release and reason ordering.
- **Back button:** App Router exposes no blocking hook (only Pages Router `beforePopState`). While a job is active the guard pushes a same-URL history entry. Back lands on that duplicate, asks, declines by stepping forward again, and on acceptance steps past the duplicate so one back press still leaves the page. When the job ends the guard steps back off the duplicate, so history has no inert extra entry.
- `npm run upload:check` replays the real production build in Chrome 155.0.8059.80 with a test-only owner session and a held `init-upload` request: **11/11 assertions**. Render → handoff → held upload locks discard/handoff/template/audio/image/upload inputs; internal nav and back both prompt, declining keeps the job held, accepting back leaves the studio and cancels the held request; a `download` anchor triggers a download with no prompt; discarding a render clears its own handoff; a later render discard leaves a manually chosen MP4 selected; after work ends one back press reaches the previous page with no prompt.
- **Limits:** this uses a test-signed cookie, not Google OAuth. The back trap was exercised as a single back press per confirm; a rapid double press or a browser that dispatches no `popstate` for same-document history is not covered. `beforeunload` copy is browser-owned and was not asserted.

### F01 — Recovery requires explicit candidate confirmation — **PASS**, 18 October 2026

- `lib/youtube/reconcile.ts` now returns every distinct same-title upload inside `[notBefore - 2 min, notAfter + 2 min]`, newest first and capped at 10. `pickMatchingUpload` is gone: a title plus timestamp is a candidate, never proof of authorship.
- `POST /api/youtube/latest-upload` now requires `notAfter`, rejects an inverted window with 400, and returns `{ candidates }` with **no** auto-selected `video`. The playlist fetch is bounded at 25 rows and still avoids `search.list`.
- The desk lists candidate title, ID, publish time and a Studio link. Nothing is recorded until the owner presses “That’s this upload”. The confirmed result and history row store `privacyStatus: "unknown"` with no schedule; History shows “Check in Studio” and “Privacy unverified”.
- Tests: `tests/history.test.mjs` asserts bounded, deduped, ordered candidates, zero tolerance, and invalid/inverted windows; `tests/routes.test.mjs` asserts a candidates-only response, exclusion of a later same-title upload, and 400/403/404 states.
- `npm run upload:check` (Chrome 155.0.8059.80) now **15/15**: network-failed session requests end in “Upload outcome unknown”; the lookup shows a candidate without adopting it; confirmation records `confirmed-recovered`; History marks privacy and schedule unverified.
- **Limits:** identity is still established by the owner’s confirmation, not by querying the retained resumable session. A real Google channel lookup and the session-query path remain unverified.

### F04 — Default schedule uses the saved zone — **PASS**, 18 October 2026

- `toDateTimeLocalValue(date, timeZone)` now formats wall time in a named zone, and `nextScheduleValue(now, timeZone)` derives the now+10-minute default there. The generate page resolves `timeZone` before seeding `schedule`, so the visible input and the value submitted as that zone cannot disagree.
- The schedule card shows `Sends as <date> <time> UTC · wall time in <zone>` using the same strict `toUtcIso8601` conversion as submission; a nonexistent or ambiguous wall time shows an inline error instead of a misleading instant.
- Tests: `tests/time.test.mjs` checks Tokyo/New York wall times, a date-line crossing, the spring-forward boundary, and the exact now+10m round trip.
- `npm run upload:check` (Chrome 155.0.8059.80) now **17/17**: with the browser forced to `America/New_York` and then `Europe/Berlin` while the saved zone is `Asia/Tokyo`, the default input stays Tokyo wall time and the displayed UTC stays within two minutes of now+10m.
- **Limits:** the fall-back ambiguous hour still rejects by design, and no deployed Google upload was performed.

### F10 — Upload state only claims completion after a confirmed result — **PASS**, 18 October 2026

- The progress card no longer equates `busy === false` with completion. Its header distinguishes sending, confirmed result, unknown outcome, stopped, and ended-without-result; “Handed off” appears only with a result, and a failed transfer explains that no confirmed result exists.
- `npm run upload:check` drives a real 256 KiB–chunked transfer: first chunk acknowledged with `308`, second rejected with `400`. The page shows **Upload stopped**, **Not handed off**, and the partial percentage — never “Upload complete”.

### F11 — Track identity and handoff metadata stay current — **PASS**, 18 October 2026

- `components/render-studio.tsx` tracks whether the owner edited the track name. Selecting a new source replaces an untouched name and preserves an explicit edit; clearing the audio resets it.
- The desk starts with an empty title and no demo description fallback. A handoff fills an untouched title from the rendered file; an edited title is preserved.
- `npm run upload:check`: selecting `Second_Track.mp3` changes the name to “Second Track”; a handoff fills “proof track”; a later handoff keeps an edited “Kept title”.

### F12 — Storage denial is handled without false saves or lost receipts — **PASS**, 18 October 2026

- `readSettings()` catches a throwing `localStorage` getter; `writeSettings()`/`resetSettings()` throw so the form reports the refusal instead of claiming a save.
- `addHistoryEntry()` now resolves `false` when storage is unavailable and keeps the receipt in a session-memory fallback; the desk shows a nonfatal “not saved locally” warning while preserving the successful upload. `clearHistory()` rejects on failure, and the page keeps its rows instead of optimistically emptying.
- Tests: a denied storage getter returns defaults and refuses writes; an asynchronous IndexedDB open failure returns `false` while the receipt remains readable this session.
- **Limits:** durability retries on a later page load, not automatically within the failed session; the denied-storage UI itself was not browser-driven.

### F13 — Cancellation stops before finalization — **PASS**, 18 October 2026

- `encodeMp4()` re-checks the abort signal after the long audio await and immediately before `finalize()`. An abort reaches the existing catch, which cancels the output. Finalization is documented as the commit boundary: a late abort after it does not pretend the work was cancelled.
- `npm run fps:check` aborts during audio encoding in real Chrome: the promise rejects with `AbortError`, no blob is returned, and the 30 fps readback still passes.

### F15 — Immediate visibility is editable; scheduled stays private — **PASS**, 18 October 2026

- The schedule card now offers **Unlisted immediately** / **Public immediately** when no schedule is set; a schedule replaces the selector with “Private until publish”. The chosen value is sent in `init-upload`; scheduling computes `private`.
- Metadata already rejected non-private schedules and forced `private` in the video resource; new Node tests assert immediate public/unlisted pass through and a public schedule rejects with 400 before any Google call.
- `npm run upload:check` selects public, clears the schedule, and asserts the paused `init-upload` body carries `privacyStatus: "public"` with no `publishAt`.

### F16 — Concurrent refreshes share one request — **PASS for one server process**, 18 October 2026

- `auth.ts` now keeps one in-flight refresh promise per refresh token. Concurrent expired requests share its result (success or failure), so a rotated token cannot be overwritten by a parallel failure from the same process.
- Tests: two concurrent expired owner requests produce one token-endpoint call; both persist the rotated cookie; a shared failure returns 401 to both.
- **Limit:** the single-flight map is process-local. Separate serverless instances still need provider-side rotation behavior or shared coordination, which was deliberately not added; actual Google behavior remains unverified.

### F14 — Output is converted and tagged BT.709 — **PASS**, 18 October 2026

- `lib/renderer/color.ts` converts every composed pixel from the sRGB transfer function to the BT.709 OETF. `lib/renderer/encode.ts` reads the canvas once, converts it, and encodes through `VideoSampleSource` with an explicit `{ primaries: bt709, transfer: bt709, matrix: bt709, fullRange: false }` colour space instead of `CanvasSource`.
- A controlled probe showed the mechanism: canvas-sourced frames carry transfer 13 (sRGB) in both `colr` and SPS VUI, while the same pixels through a BT.709 `VideoSample` carry transfer 1, primaries 1, matrix 1 and limited range in both places. This is conversion plus signalling, not a relabel of sRGB pixels.
- `tools/m0-probe/mp4.mjs` gained `readColorTags()`, a real H.264 SPS VUI parser plus a validated `colr`/`nclx` reader. It reproduces the historical file's sRGB tagging (transfer 13) and `tests/probe.test.mjs` pins that result.
- `npm run fps:check` now asserts the freshly encoded file has `colr` primaries 1 / transfer 1 / matrix 1 / limited and an SPS VUI with the same values, and the Mediabunny readback reports `bt709/bt709/bt709/false`. Tests 84/84; the production upload replay still passes 25/25, and VLC decoded the new 30 fps file with VideoToolbox to the end (exit 0).
- **Limit:** the conversion is verified at the pixel-LUT and tag level. A colorimeter/display-referred comparison against a reference renderer was not performed.

### Email-verification hardening — **PASS**, 18 October 2026

- The Google sign-in callback now requires `profile.email_verified === true` in addition to the owner-email match. Missing or false verification fails closed instead of authorizing from an unverified email claim.
- `tests/auth.test.mjs` covers verified owner, unverified owner, missing claim, and verified non-owner.

### History truthfulness — **PASS for labeling; actual YouTube state still unfetched**, 18 October 2026

- A passing scheduled time no longer reads as “Published”. `historyStatus` returns `publish-time-passed`, the History badge says “Publish time passed”, and the footer states that release state is inferred rather than checked with YouTube.
- This does not query YouTube for real processing/privacy/publication state; that remains a documented limitation, not a verified release status.

### Open hardening list — repaired, 18 October 2026

**Input resource budgets — PASS, including a measured 5-minute peak.** `lib/renderer/assets.ts` reads PNG/JPEG/WebP/GIF dimensions from the file header without decoding pixels, rejects images above 32 MP (~128 MiB RGBA) before `createImageBitmap`, passes `resizeWidth`/`resizeHeight` so decoders that support it resize while decoding (the full-size bitmap is then not retained), and re-checks the decoded bitmap. Unknown formats still decode first, then hit the post-decode cap. `lib/renderer/audio.ts` rejects files above 64 MiB before loading bytes, reads duration from metadata (5 s timeout, no full decode) and rejects over 15 minutes before allocating an `AudioBuffer`; a failed probe falls back to the existing post-decode check. `tests/budget.test.mjs` builds real `File` headers for PNG, JPEG, WebP and an unknown format and covers both budgets. `npm run memory:check` measured a 5-minute beat (54.9 MiB WAV, under the 64 MiB cap) at **1067 MiB peak renderer memory** on an 8 GB 2013 MacBook Air, inside the 1536 MiB budget; see below.

**Audio bitrate contract — DECIDED: 288 kbps AAC VBR target.** Measured in Chrome 155.0.8059.80 with Mediabunny 1.61.4 on the real encoder: 10 s dense stereo encoded at **290 kbps**, while a 2 s 440 Hz sine encoded at 64 kbps. That is content, not a configuration failure. `bitrateMode: 'constant'` produced byte-identical output to the default at 192 kbps, so Chromium ignores constant mode for AAC here; promising a hard floor would be false. `npm run fps:check` now encodes 10 s of dense stereo and asserts the measured rate stays inside the spec's 256–320 kbps range, while the 2 s tone is reported as content-dependent. Treat 256–320 kbps as the target range for representative music.

**History truthfulness — PASS, including actual state.** Added owner-only `POST /api/youtube/video-status` (`videos.list` with `status,processingDetails`, at most 50 validated IDs) and a **Refresh from YouTube** action on History. `historyStatus` now returns `published`/`unlisted` only when a real status check set `checkedAt`, reports failed uploads/processing with `failed`, and never treats a passed timestamp as publication. Refreshed state is written back through the existing durable history store. `npm run upload:check` fulfils the status route in production Chrome: the entry changes from “Check in Studio” to “Published”, “Privacy unverified” disappears, and the result survives a full reload through IndexedDB.

**IndexedDB lifecycle — PASS, including a real two-tab replay.** `lib/history-store.ts` rejects a blocked upgrade instead of hanging, closes on `versionchange` so another tab can upgrade, and no longer caches a failed open forever. `lib/history.ts` retries in-session: memory fallback rows are flushed into IndexedDB on the next read or write, and a `BroadcastChannel` tells other tabs to reread. `npm run idb:check` now also opens two real tabs: a raw holder blocks tab B's upgrade and the adapter rejects instead of hanging, then the upgrade completes after the holder closes; a write in either tab wakes the other through `BroadcastChannel`; and after tab B upgrades the schema to version 2, tab A reopens at the current version instead of throwing `VersionError`.

**Accessibility — automated WCAG A/AA audit PASS.** The template picker is now three native radio inputs inside a labelled `role="radiogroup"` (arrow keys and focus behave natively), with a visible focus ring on the label. `Field` links hints and errors with `aria-describedby` and sets `aria-invalid` on error; `TagInput` forwards the description to its actual input. `npm run a11y:check` runs axe-core 4.14 on `/`, `/generate`, `/history`, `/settings`, and mobile `/generate`, then tabs through the studio: **0 violating rules** in five runs and **10/10 primary controls reached** in 69 keyboard stops. The audit found and we fixed a brand link whose accessible name did not contain its visible text and a duplicate `<label>` on the upload input. Color-contrast is reported for manual review on gradient/alpha nodes; the project tokens measured 6.39:1–14.88:1. Manual screen-reader testing remains open.

**Maintainability — PASS.** Upload state and orchestration (session handshake, chunked transfer, progress, cancellation, unknown-outcome recovery, history receipt) moved to `lib/use-upload-job.ts`. `app/(app)/generate/page.tsx` dropped from 1043 to 815 lines and keeps only form/preview rendering. The full browser replay re-verified the extracted behaviour.

**Documentation/status — PASS.** Removed the M0 demo instructions from the studio, home badge, shell label and upload copy, and updated `README.md` and `docs/progress.md`.

Verification run on 18 October 2026 (Chrome 155.0.8059.80):

| Check | Result |
| --- | --- |
| `npm test` | 81/81 passed |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed, `/api/youtube/video-status` generated |
| `npm run fps:check` | Passed; 290 kbps dense stereo, abort still rejects with `AbortError` |
| `npm run upload:check` | 25/25 browser assertions in the production build |
| `npm run idb:check` | Passed |

### Two-tab IndexedDB, WCAG audit and peak memory — executed, 18 October 2026

**Two-tab replay — PASS.** `npm run idb:check` now drives two independent CDP tabs against real IndexedDB. A raw tab-A connection without `onversionchange` makes tab B's version-2 upgrade fire `blocked`; the adapter rejects with an actionable error instead of hanging, and the upgrade completes after A closes. A write in either tab increments the other tab's `beatflow:history` event through `BroadcastChannel`, even when that tab has only ever read. After B upgrades the schema, A reopens with `factory.open(name)` (no pinned version) and reads/writes normally. Findings during the replay: a reader-only tab never created its channel, and a blocked request that later opened leaked a connection; both are fixed.

**Accessibility audit — PASS for automated WCAG A/AA, manual AT review open.** New `npm run a11y:check` (axe-core 4.14, production build, synthetic owner session) runs WCAG 2.0/2.1/2.2 A+AA rules on `/`, `/generate`, `/history`, `/settings`, and `/generate` at 390 px: **0 violations** in all five runs. It also tabs 70 times through the studio and reaches all ten primary controls (audio, image, template radio, MP4 input, title, description, tags, schedule, chunk size, Start upload). The two product fixes it drove: the brand link's `aria-label` no longer disagrees with its visible `BEATFLOW / STUDIO` text (the label was removed), and the second `Choose MP4` label became a real button so the file input has one label. `color-contrast` is “incomplete” on gradient/overlay nodes; the palette pairs measure 6.39:1–14.88:1, above AA. No screen reader or platform assistive-tech pass was run.

**Peak memory — PASS on the agreed target.** Target: 8 GB 2013 MacBook Air (dual-core i7, the check machine), budget **1536 MiB** renderer RSS during a 10-minute render; real beats are 3–5 minutes, so the measured maximum is 5 minutes. `npm run memory:check` injects a synthesized 48 kHz stereo WAV (54.9 MiB for 5 minutes, under the 64 MiB input cap) and the 1920×1080 background into the real production UI, samples the Chrome process tree every 100 ms, and forces GC after discard.

| Duration | Peak renderer | Peak whole tree | Wall time |
| --- | --- | --- | --- |
| 30 s | 1000 MiB | 1489 MiB | 4.2 s |
| 3 min | 1283 MiB | 1745 MiB | 14.7 s |
| 5 min | **1067 MiB** | 1486 MiB | 18.8 s |

These numbers are from the BT.709 encoding path; the pre-conversion run measured 831 / 997 / 1042 MiB, so the conversion and per-frame `VideoFrame` cost is inside the same budget. Five consecutive 30 s render/discard cycles retained 545–550 MiB; final-minus-first growth was **4 MiB** (limit 150 MiB). The 3- and 5-minute peaks are inside the 1536 MiB budget; the whole-tree total is close to 1.5 GiB of system memory, which is expected because it includes Chrome's browser, GPU and utility processes. Baseline before rendering was 676–918 MiB, so the render itself adds roughly 150–370 MiB. `MEMORY_MODE=quick` runs only the 30 s case.

**Production runbook — READY, execution owner-gated.** `docs/PRODUCTION-RUNBOOK.md` records the exact precondition list, consent/redirect settings, 256 KiB CORS and 308 checks, scheduled-publication timeline, quota readings and a result template. `tools/production-status.mjs` is a read-only recorder: it prints the channel and up to 50 video statuses without printing the cookie, and rejects non-HTTPS origins (except localhost) and malformed IDs. Only its argument validation was exercised locally; the real path still needs the owner's session and Google project.
