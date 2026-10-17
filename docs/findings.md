# BeatFlow — comprehensive codebase review

Reviewed 17 October 2026. The original review below describes the pre-repair baseline.

## Repair follow-up — 17 October 2026

The owner subsequently authorized M0 repairs. Upload network/status recovery, completed IDs, confirmed offsets, bounded retries, Retry-After and cancellation are repaired; public sessions omit credentials; internal route wrappers persist refresh cookies; refresh errors fail clearly; API denials/network errors are structured JSON. Hydration, DST/calendar validity, tag/description rules, displayed validation details and init cancellation are repaired. Zod is declared directly. Native regression tests and required probe assertions are wired into CI; docs include a refreshed M0 project acceptance checklist. See `progress.md` for final verification. Baseline bundled MP4/report are preserved.

The historical findings below remain as review context, not a claim that repaired defects are still present. Real Google CORS/publication/quota and future M1 media/performance acceptance remain open. Probe-parser/general test-server hardening and minor visual cleanups were not prerequisites for these M0 workflow repairs.

## 1. What the product is trying to achieve

BeatFlow is a personal music-to-YouTube publishing workspace for one owner's channel. It is not a multi-user SaaS, general-purpose video editor, or backend rendering platform.

Intended workflow:

1. Sign in with the owner's Google account and confirm the destination channel.
2. Select an MP3 and a background image.
3. Choose one of 2–3 static presets; derive the track name from the filename and let the owner edit branding and supplied variables.
4. Show a live canvas preview with the original MP3, without encoding a preview video.
5. Generate a 1920×1080 H.264/AAC MP4 entirely in the browser; preview and download it.
6. Edit YouTube metadata and immediate/scheduled visibility, then publish explicitly.
7. Upload directly from the browser to YouTube; YouTube, not a backend scheduler, handles publication after acceptance.
8. Keep templates/history/settings locally in IndexedDB; no server-side media storage, queue, database, or render service in v1.

The architectural priorities are modest CPU/RAM on an older laptop, clear cancel/cleanup behavior, one render at a time, and reliable publishing without duplicating uploads. Current desktop Chrome/Edge only is a deliberate constraint.

### Interfaces and output acceptance

The planned renderer interface is `renderVideo({ audio, background, template, vars }, { fps?, signal, onProgress }): Promise<Blob>` with MIME `video/mp4`. `previewFrame` must share the same scene drawing implementation; `lib/renderer/` must remain React-free.

Required output: non-fragmented MP4, moov before mdat, no edit lists, 1920×1080 even dimensions, H.264 High level 4.0, progressive 4:2:0 with BT.709 tagging, configurable fps initially 1, keyframes around 2 seconds, AAC-LC stereo 48 kHz at a 256–320 kbps target, duration within 0.1 seconds of input. The final partial frame needs the remaining audio duration, not an unconditional full frame.

## 2. Where the repository actually is

| Milestone | Current state |
| --- | --- |
| M0: YouTube proof | Owner auth, channel API, upload initialization, test UI, browser uploader, and local codec/media proof exist. Real deployed-origin upload, schedule outcome, and project quota are still not recorded. |
| M1: render proof | Not implemented in the app. The 5-second synthetic probe is supporting evidence, not completion of MP3/image rendering. |
| M2: templates | No renderer schema, scene engine, templates, variable binding, or title auto-fit yet. |
| M3: publishing | Some metadata/upload groundwork exists for M0; robust recovery, full visibility/timezone controls, and IndexedDB history remain. |
| M4: polish | Settings, discard confirmation, full error/empty states, and production workflow polish remain. |

Missing M1–M4 features are planned work, not defects in M0. Milestone progression requires approval; no M1 implementation was started during this review.

### Architecture assessment

- `auth.config.ts`: Google provider, owner sign-in restriction, optimistic authorization.
- `auth.ts`: JWT token capture/refresh and session projection.
- `proxy.ts`: coarse gate on `/generate` and `/api/youtube/*`.
- `lib/require-owner.ts`: independent handler-level authorization.
- YouTube route handlers: channel lookup and metadata-only resumable initialization.
- `lib/youtube/uploader.ts`: framework-free browser uploader; media never traverses Next API routes.
- `lib/time.ts`, `lib/youtube/metadata.ts`: shared conversion/validation helpers.
- `tools/m0-probe/`: local, independent real WebCodecs/Mediabunny encoding and playback harness.

This is a sensible foundation for the intended scope. A major architecture rewrite or extra hosted infrastructure is not justified.

## 3. Prioritized findings

### High — interrupted upload recovery is not reliable

**References:** `lib/youtube/uploader.ts:104–114,146–181`; `app/generate/page.tsx:93–140`.

Reproduced against the actual helper with mocked HTTP responses:

- A thrown fetch/network error exits immediately. `retryable: true` does not cause retry; nothing in the UI consumes it or retains a resumable workflow.
- A status query returning 200/201 with a completed video resource is reduced to `totalBytes`. The loop exits and throws `Upload finished without a video id.` A video can already exist while the UI reports failure, inviting duplicate submission.
- A status 308 with no Range falls back to the sent chunk end. Google's protocol says an actual absent Range means zero bytes stored. Guessing advances past unconfirmed bytes.
- Repeated 308 responses reporting no forward progress have no bounded retry/backoff; the normal retry counter resets on each 308.
- Every normal chunk 308 incurs a second PUT status query even though its direct Range could provide the offset.

**Direction:** model incomplete/completed/error status explicitly, preserve completed video IDs, recover network failures within the same session, use confirmed offsets only, and bound no-progress retries. Respect Retry-After and cancellation. Verify browser visibility of 308/Range on the actual deployed origin.

**Important correction:** wrong offsets are not proof that Google accepts corrupt media. Google documents rejecting skipped/overlapping byte ranges. The established risks are stalls, failed recovery, misleading progress/results, and duplicate uploads.

### High — current M0 evidence cannot close the publishing gate

**References:** build spec §3/§9; `M0-FINDINGS.md:9–36,80–100`.

No real deployed-origin CORS result, observed scheduled-publication outcome, or owner's Cloud Console quota is recorded. These are still the acceptance gate stated in the spec. Local codec success is not a substitute.

There is also a material documentation change: the current official videos.insert reference explicitly says **videos uploaded from unverified API projects are not restricted to private viewing mode**. The current quota reference consistently lists a separate 100-call/day Video Uploads bucket at 1 unit per call. The historical private-lock certainty and contradictory quota table discussion should therefore be revalidated, not repeated as current facts.

**Direction:** update the dated assumptions with current authoritative references and record an authorized real M0 run. Do not assume an audit application is necessary based only on the historical notes. Do not skip milestone approval based only on the changed documentation.

### Important — token refresh failures are treated as usable credentials

**References:** `auth.ts:11–13,48–49`; `lib/require-owner.ts:23–31`.

A failed refresh leaves the old `accessToken` on the token and sets an error. The guard checks token presence only, so an expired-token owner session is returned as `ok: true`. Reproduced with `RefreshAccessTokenError` and a stale token.

This does not grant a nonowner access; upstream Google calls then fail instead of producing a clear reauthentication state.

The installed Auth.js no-argument `auth()` path also returns the session without forwarding refresh Set-Cookie headers. The proxy uses the configuration without refresh logic. Consequently route-level refreshed JWT state is not clearly persisted to the browser; verify repeated requests and refresh-token rotation before relying on long-lived sessions.

**Direction:** reject refresh-error sessions cleanly, offer sign-in recovery, and verify refresh persistence through a response-writing route/wrapper. Raw JWT reads alone are not a replacement for token-refresh logic.

### Important — access token is browser-readable now, contrary to its type comment

**References:** `auth.ts:78–85`; `types/next-auth.d.ts:5`.

With a synthetically signed local session containing fake tokens, `GET /api/auth/session` returns `accessToken`. No `useSession` consumer is needed. The refresh token was correctly absent from both the session and session user.

An owner receiving their own short-lived access token is not an authentication bypass and the spec allows it as a possible upload fallback. It does, however, enlarge exposure relative to the claimed server-only boundary and does so unconditionally.

**Direction:** make the boundary intentional: either keep access credentials out of public session serialization or explicitly document/limit browser access if the upload design needs it. Continue never serializing refresh tokens.

### Important — scheduling has both hydration and date-conversion defects

**References:** `app/generate/page.tsx:24–44`; `lib/time.ts:48–64`; `lib/youtube/metadata.ts:55–78`.

- `/generate` is statically prerendered but renders Date.now-derived schedule state and the executing environment's timezone. Its HTML contains a build-time date/time. Chrome emulated in America/New_York against the Africa/Lagos prerender reproduced React hydration error #418 and a client rerender.
- `2026-03-08T03:30` in America/New_York should be `2026-03-08T07:30:00Z`; the helper returns `08:30:00Z` because it samples the offset at the naive UTC instant.
- The local-value regex accepts trailing junk and Date.UTC normalizes impossible dates. The server schema likewise accepts a future `2028-02-31T10:00:00Z` because Date.parse normalizes it.
- Ordinary Lagos conversion is correct, and past/private-visibility validation works.

**Direction:** initialize browser-specific values after mount with stable initial markup; strictly validate calendar/time components and round trips; handle DST gaps and ambiguous times with an explicit policy. A second offset pass can help ordinary transition errors but is not a full ambiguity policy.

### Important — Cancel does not cover the whole publishing operation

**References:** `app/generate/page.tsx:88–110`; `lib/youtube/uploader.ts:147,163–166`.

Init-upload does not receive the controller's signal. Browser testing held that request pending, clicked Cancel, and confirmed the UI stayed busy with no cancellation acknowledgement until initialization returned. Status queries also lack the signal; sleep is not abort-aware and requests have no independent timeout.

**Direction:** propagate cancellation through initialization, data PUTs, status PUTs, and backoff, and check the signal before reporting success. Cancel cannot guarantee that a remote upload already accepted by YouTube is undone; UI messaging must not imply deletion.

### Important — zod is a production import with no production dependency

**References:** `package.json:12–18`; `lib/youtube/metadata.ts:1`; `app/api/youtube/init-upload/route.ts:2`; lockfile `node_modules/zod`.

Zod resolves through a hoisted dev-only ESLint dependency. A production-only install has no declared guarantee that these imports resolve. The present full development install/build passing does not make this dependency contract safe.

**Direction:** declare zod directly in dependencies and update the lockfile when implementing the fix.

### Important — validation accepts metadata that YouTube rejects

**References:** `lib/youtube/metadata.ts:29,46–52`; `app/generate/page.tsx:112–114`.

- Tag length omits commas and the two quote characters counted around tags containing spaces. Reproduced: 100 copies of `a b c` pass at 500 raw characters but count as 799 under Google's documented rule.
- Descriptions containing `<` or `>` pass local validation, despite official API restrictions.
- The API returns field-level issues, but the UI discards them and displays only `Invalid upload request.` Browser reproduction confirmed the actionable issue message is hidden.

**Direction:** align accounting/content rules with the upstream API, then surface field errors. Unicode character policy should be explicit too, but it is not the primary demonstrated tag bug.

### Important — the probe is diagnostic, not a trustworthy pass/fail gate

**References:** `tools/m0-probe/probe.html:68–86,370–383`; `tools/m0-probe/run.mjs:223–241`; `.github/workflows/ci.yml:32–38`.

The page captures step exceptions into `ok: false`. The runner still writes/prints the report without setting a failure exit status when codecs/render/playback fail or MP4 inspection is null. An isolated execution of the actual runner with failed step results confirmed this behavior. Seek timeout also resolves as success.

There are no committed unit/integration regression tests or test script; CI only lints/builds. The probe is genuine runtime testing and should not be dismissed as no testing at all, but it is not run by CI and is not currently an asserting acceptance suite.

**Direction:** separate expected exploratory capability variants from required checks, fail required checks explicitly, validate output properties, and add focused source-level regression coverage without requiring Google credentials.

## 4. Rendering and performance review

The fresh probe proves useful, narrow facts on this Mac/Chrome: actual H.264/AAC encoding works, Mediabunny creates a readable non-fragmented fast-start MP4, every packet decodes, and Chrome plays/seeks it. It does not implement the production renderer or establish older-laptop performance.

### Resource budget remains the main M1 risk

Decoded 48 kHz stereo Float32 audio alone uses `48,000 × 2 × 4 × seconds` bytes: approximately 220 MiB for 10 minutes and 330 MiB for the 15-minute default maximum. Source MP3 bytes, image decoding, canvas, encoder buffers, in-memory encoded packets, final output buffer, and Blob can overlap with that.

The installed muxer's `fastStart: 'in-memory'` retains encoded chunks until finalization. That is acceptable as a simple starting point but must be measured on representative music/artwork. Low fps reduces video submissions; it does not remove full decoded-audio memory.

M1 should measure 3- and 10-minute stereo/mono sources, 44.1/48 kHz input, five sequential renders, cancellation at every stage, and peak/process memory. Define a concrete memory/CPU/wall-time budget for the intended older laptop before claiming the requirement is met.

### Format acceptance is incomplete

- The box inspector verifies dimensions, sample entries/counts, durations, front moov, and no elst. It does not parse H.264 SPS details, chroma/progressive flags, or color metadata.
- Direct examination of the bundled artifact found avcC bytes indicating High profile, level 4.0, with codec string `avc1.640c28`. Accept semantic profile/level rather than requiring the literal constraint-byte spelling `640028`.
- The bundled `colr/nclx` fields are primaries 1, transfer 13, matrix 1, full-range: BT.709 primaries/matrix with sRGB transfer, not uniform BT.709 1/1/1 signaling. The probe does not configure or assert the full color contract. Decide and verify how the BT.709 requirement applies before copying the pipeline into M1.
- The 5-second AAC track is about 77 ms longer than video, within the spec's 0.1 s tolerance. This does not prove correct offsets/trimming for real MP3 inputs.
- Targets are VBR: the synthetic sine/static content has much lower measured bitrate. Resolve whether 256–320 kbps is a target or strict encoded-rate requirement. If strict, evaluate constant mode on actual supported encoders; do not assume support or infer quality from rate alone.
- ffprobe/MediaInfo/VLC validation, 1/5/24 fps YouTube processing, full-length renders, five-render memory behavior, and unsupported-codec UX remain unverified. (Later measured: VLC playback, the 3- and 10-minute renders, and five-render memory are recorded in `docs/progress.md`; 1/5/24 fps YouTube processing still needs the owner's channel.)

### Do not copy probe cleanup as production cleanup

The direct audio probe creates AudioData without explicitly closing it; failure paths lack comprehensive encoder/output/input cleanup. The local server has incomplete suffix-Range support and uncaught async I/O paths. These are low-priority in a short-lived, loopback-only diagnostic tool but not suitable production patterns.

## 5. Secondary observations

- Next 16 proxy runs in Node, not Edge. The split is harmless and remains useful separation, but comments in auth.config/proxy/README are stale.
- API proxy denial redirects fetch requests to an HTML sign-in page. The client expects JSON and reports a misleading network/parse error after session expiry; API denial should be machine-readable.
- Server Google fetch/network/JSON failures do not have a consistent structured 502/timeout response.
- `authedFetch` spreads `init.headers` as a plain object; this loses entries if a future caller passes Headers or tuple-form headers. Existing call sites do not exercise that case.
- YouTubeApiError is unused. No need to build a larger abstraction around it until it has a consumer.
- Inputs are correctly label-wrapped, but progress/status/error updates lack suitable progressbar/live-region semantics.
- `globals.css` hardcodes Arial even though Geist variables are loaded; minor visual inconsistency.
- CI is push-only, so external PRs do not get the same explicit PR-triggered check. Existing action v7 references match current upstream, not an assumed version error.
- Production-domain OAuth is documented configuration, not an application-enforced hostname restriction. Verify canonical AUTH_URL/callback behavior on the actual deployment.
- The UI's successful result repeats requested privacy/schedule values; it does not independently verify actual YouTube publication, audit state, or processing. That is appropriate as an upload receipt, not proof of M0 publication acceptance.

## 6. Corrections to the earlier review

1. Access token exposure is present on `/api/auth/session` already, not merely latent until useSession is added. Refresh-token exclusion was confirmed.
2. The central tag bug is missing separator/quote overhead. UTF-16 length can overcount astral characters; the earlier claim that it necessarily allows emoji-heavy tags past the limit was unsupported.
3. Guessed upload offsets demonstrate broken protocol recovery, not accepted corrupted uploads.
4. There is meaningful real browser/media testing, even though there is no committed unit/integration suite.
5. A 100% progress indicator remaining after a successful upload is not itself a bug and should not be prioritized.
6. `avc1.64003e` ends with hexadecimal 0x3e = level_idc 62 (level 6.2), not level 3.0 as M0-FINDINGS says. The observed unsupported numeric-Quality variant is real; the precise historical explanation should be corrected.
7. Historical private-lock claims are no longer consistent with the current official API reference and should not be restated as confirmed current policy.

## 7. Verification performed

No real Google account credentials, OAuth flow, publishing, deployment, or external data mutation was used.

| Verification | Result |
| --- | --- |
| Prior lint, TypeScript, production build | Passed against unchanged application source; not rerun unnecessarily. |
| Focused actual-source behavioral checks | 13 evidence checks completed; confirmed both working cases and the listed defects. Temporary scripts are review reproductions, not a newly installed test suite. |
| Local unauthenticated HTTP | Home 200/sign-in; generate and YouTube routes 307/sign-in; provider endpoint 200 JSON. |
| Local synthetic owner/nonowner sessions | Owner page 200; nonowner page/channel rejected with 307. Guard isolation also confirmed missing/unconfigured/nonowner rejection. |
| Local public auth session serialization | Fake access token present; fake refresh token absent. |
| Browser UI with intercepted fake Google boundaries | Timezone hydration error, hidden issue details, and nonresponsive pending-init Cancel reproduced. |
| Existing bundled MP4 inspection | Historical 108,389 bytes and report's structural metadata match. |
| Fresh isolated unchanged probe page | All seven steps passed, including real encodes, full decode, playback, 108,314-byte MP4, moov before mdat, no elst, 1920×1080/1 fps, stereo 48 kHz, 5.077 s. |
| Synthetic render time | 465 ms on this run only; not representative of music-track rendering or a measured speedup. |
| Probe false-success reproduction | Actual runner with failed required steps and null inspection does not set failure exit status. |
| Application/artifact source preservation | No tracked application or baseline artifact modifications. Only review markdown files added. |

## 8. Recommended sequence

1. Make M0 trustworthy: declare zod, repair uploader recovery/completion/cancellation and refresh-error behavior, expose useful validation errors, add regression checks, and make required probe failures fail.
2. Refresh the dated external assumptions and complete the authorized real M0 deployment test: destination channel, data PUT and 308/Range visibility, scheduled publication/processing, and actual project quota. Record evidence and obtain milestone approval.
3. Implement M1 only: one hard-coded design, actual MP3/image input, shared scene preview/export, output/download, cleanup/cancel, codec fallback UX. Establish long-track performance and media acceptance before templates/polish.
4. Add M2 schema/presets/variables/title fit, then M3 full publishing/history and M4 settings/polish, stopping at each acceptance gate.

**Verdict:** the direction and boundaries fit the product well; the current code is a useful M0 scaffold with a working local media proof, not yet a reliable end-to-end publishing tool. The best next work is narrow reliability fixes and M0 evidence, not additional infrastructure or a broad rewrite.
