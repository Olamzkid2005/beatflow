# BeatFlow — M0 findings

Answers to section 3 (risks to settle first) and section 12 (unverified assumptions).
Research refreshed 17 October 2026; historical media measurements below are from
13 October. Anything marked **open** still needs a real run against the owner's
Google Cloud project or deployed origin. M0 is not complete until those results
are recorded and the owner approves the next milestone.

## Section 3 — risks

### 1. Scheduled publication — **project behavior remains open**

The current official `videos.insert` reference explicitly states:

> Videos uploaded from unverified API projects are not restricted to private viewing mode.

This supersedes this document's earlier claim that a post-July-2020 project
necessarily locks API uploads private. Do not apply for an audit solely because of
that historical assumption. Other creator/project restrictions may still apply.

**Still open:** whether the owner's real `private` + `publishAt` upload processes
and goes public on schedule. Record actual privacy/processing state and observed
publication time. Investigate any restriction actually returned by YouTube.

Source: https://developers.google.com/youtube/data/reference/rest/v3/videos/insert

### 2. Quota — **the spec's 1,600-unit figure is out of date**

The current quota page states:

> Projects that enable the YouTube Data API have a default quota allocation of 100
> `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined
> for all other endpoints.

> The `search.list` and `videos.insert` methods have their own quota buckets. Each of
> these methods has a default daily limit of 100 per day. The quota cost is 1 per call.

The documented default is **100 upload calls per day in its own bucket**, not ~6.
The current quota table and insert reference agree: 1 unit per call in the Video
Uploads bucket. The earlier table contradiction is no longer present. Quotas reset
at midnight Pacific Time and are shared per project, not per API key.

**Still open:** the real number shown on the Quotas page in the owner's Google Cloud
console. Record it there.

Source: https://developers.google.com/youtube/v3/determine_quota_cost

### 3. OAuth Testing mode

Not researched against the owner's project — this is a console setting. Set the consent
screen to **In production** so refresh tokens do not expire after 7 days. The
unverified-app warning is acceptable for a single user.

### 4. Open API routes

Handled in code. Every `/api/youtube/*` handler calls `requireOwner()`, and `proxy.ts`
rejects non-owner sessions before the request reaches them. Both layers were verified
(see the verification log below).

### 5. Redirect URIs

Register the callback only for the production domain. Preview deployments get a new
hostname on every deploy, so register `https://<production-domain>/api/auth/callback/google`
and nothing else.

### 6. Body limit

Avoided by design. The MP4 is PUT from the browser straight to Google's session URI.
`/api/youtube/init-upload` receives only metadata and a file size.

### 7. Browser upload CORS — **open, must be measured on the deployed origin**

Public sources conflict, and there is a long-standing Google issue tracker entry about
resumable-upload requests failing CORS (`issuetracker.google.com/issues/158718687`).
This cannot be settled from documentation. Test the actual deployed origin and
server-issued session URI; do not assume that localhost or Node fetch proves CORS.

**Test in M0:** confirm the data PUT and its response are browser-readable. The bundled
108 KB file is smaller than the 8 MiB chunk size, so it alone does not exercise a 308.
Choose the page's 256 KiB chunk option and upload a sufficiently large test video to
verify a nonfinal 308, exposed `Range`, and status PUT (`Content-Range: bytes */total`).
The page warns when the selected file fits in a single request, which would not expose
a 308. Never infer received bytes from the size sent. If a short-lived access-token fallback
is necessary, design and document it explicitly; public sessions currently expose no
Google credentials. Never expose the refresh token.

## Section 12 — unverified assumptions

| Assumption | Status |
| --- | --- |
| Mediabunny option names | **Confirmed** — see below |
| Chrome can encode AAC via WebCodecs | **Confirmed** — real encode works here |
| YouTube plays a 1 fps video | **Open** — needs an upload |
| AAC encoder delay creates an edit list | **Answered: no edit list**, but audio runs ~77 ms long |
| Real `videos.insert` quota | **Open** — read it in the Cloud console |
| Scheduled publishing for this project | **Open** — M0 test; private-lock assumptions refreshed above |
| Browser can PUT to the session URI | **Open** — M0 test |

### Mediabunny (1.61.4) option names

Taken from the current docs, so M1 can be written against these directly.

```ts
import {
  Output, BufferTarget, Mp4OutputFormat,
  CanvasSource, AudioBufferSource, Quality,
} from 'mediabunny';

const output = new Output({
  // Non-fragmented MP4 with the moov atom at the front.
  // `undefined` already behaves like 'in-memory' for BufferTarget, but set it
  // explicitly. Do NOT use 'fragmented' — that produces fMP4, which section 5 forbids.
  format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  target: new BufferTarget(),
});

const videoSource = new CanvasSource(canvas, {
  codec: 'avc',
  quality: new Quality({ bitrate: 1_600_000 }), // or new Quality('high')
  fullCodecString: 'avc1.640028',               // H.264 High @ L4.0
  keyFrameInterval: 2,                          // seconds; 2 is already the default
});

const audioSource = new AudioBufferSource({
  codec: 'aac',
  quality: new Quality({ bitrate: 288_000 }),
  fullCodecString: 'mp4a.40.2',
  transform: { sampleRate: 48_000, numberOfChannels: 2 },
});

output.addVideoTrack(videoSource);
output.addAudioTrack(audioSource);
await output.start();
await videoSource.add(timestampSeconds, durationSeconds); // await = backpressure
await audioSource.add(audioBuffer);
videoSource.close();  // release encoders early
audioSource.close();
await output.finalize();
const blob = new Blob([output.target.buffer!], { type: 'video/mp4' });
```

Notes:
- Bitrate is set through `Quality`, not a top-level `bitrate` field. Also accepts
  `new Quality({ bitrate: 1e6, bitrateMode: 'constant' })` or `{ quantizer: n }`.
- `keyFrameInterval` is in **seconds** and defaults to 2 — already what section 5 wants.
- `fastStart: 'reserve'` is the low-memory fast-start option, but it requires
  `maximumPacketCount` on every track. `'in-memory'` is simpler; watch memory on long tracks.
- Call `close()` on each source when finished, to free encoders before finalize.
- The capability check is `getEncodableVideoCodecs()` / `getFirstEncodableVideoCodec(
  format.getSupportedVideoCodecs(), { width: 1920, height: 1080 })` and the audio equivalents.

### Chrome AAC via WebCodecs — measured, works

MDN states plainly that "AAC encoding support in WebCodecs has notable gaps". Chromium on
desktop does generally support `mp4a.40.2`, but there is a Chromium report that
**`AudioEncoder.isConfigSupported()` returns `true` for AAC and the encode then fails**.
So the capability check in section 5 step 1 is necessary but not sufficient: M1 must
follow `isConfigSupported` with a real `configure` → `encode` → `flush` and treat a throw
as unsupported.

On this machine (Chrome 155.0.8059.40, macOS) both encoders pass a **real** encode, not
just a support query. See the measurement section below.

## Measured on this machine — 13 October 2026

`npm run m0:probe` runs `tools/m0-probe/` in the installed Chrome and renders a real
5-second MP4 through the same Mediabunny pipeline M1 will use. It answers the assumptions
above that never needed a YouTube account. Raw results are in
`tools/m0-probe/report.json`.

Environment: Chrome 155.0.8059.40, `HeadlessChrome` on macOS, secure context.

| Check | Result |
| --- | --- |
| `VideoEncoder.isConfigSupported(avc1.640028, 1920×1080)` | `true` |
| Real H.264 encode (5 frames @ 1 fps) | 5 chunks, 3 keyframes, no encoder error |
| `AudioEncoder.isConfigSupported(mp4a.40.2, 48 kHz, 2ch)` | `true` |
| Real AAC encode (1 s) | 50 chunks, no encoder error |
| Mediabunny `canEncodeVideo('avc', …)` | `true` **only with the right Quality spelling** (below) |
| Mediabunny `canEncodeAudio('aac', …)` | `true` |
| Rendered file | 108,389 bytes, `ftyp → moov → mdat` |
| `moov` offset / `mdat` offset | 28 / 2221 — **moov is first, fast start works** |
| Edit list | **none** (`edts` and `elst` both absent) |
| Tracks | `vide avc1 1920×1080` 5 samples / 5.000 s; `soun mp4a 48 kHz 2ch` 238 samples / 5.077 s |
| Chrome playback | 5.077 s, 1920×1080, `readyState` 4, seek to 4 s lands at 4.00 s |
| Decoding every packet | 5 video frames and 238 audio buffers decode cleanly |

### Three things M1 must copy from this probe

1. **`new Quality(1_500_000)` does not work.** Mediabunny's number shorthand is not a
   bitrate. The unsupported numeric variant was observed; `avc1.64003e` ends
   in `0x3e` (level_idc 62, **6.2**, not 3.0 as previously recorded). Use
   `new Quality({ bitrate: 1_500_000 })`, or `bitrateMode: 'constant'` for CBR. This is
   the difference between "works" and "this environment is unsupported".
2. **Pin `fullCodecString: 'avc1.640028'` explicitly** so the level cannot be inferred
   downward. Note the muxed file then declares `avc1.640c28`, not `avc1.640028`: the
   macOS encoder sets constraint-set flags 2 and 3 (`0x0c`). Still H.264 High, still
   level 4.0. Chrome decodes it; YouTube acceptance still needs the real upload.
   A test asserting the exact string `640028` inside the file would fail.
3. **`fastStart: 'in-memory'` is the right setting.** The file came out non-fragmented
   with `moov` at byte 28, ahead of `mdat`, exactly as section 5 requires. Do not use
   `'fragmented'`.

### Audio is 77 ms longer than video and there is no edit list to hide it

The AAC track is 238 frames at 48 kHz = 5.077 s against the video's 5.000 s. That is AAC
priming and padding, and Mediabunny compensates for it with **no edit list at all**.

So section 12's worry is half right. There is no `elst` to trip up a strict demuxer, but
there is ~77 ms of trailing audio. The spec's "video and audio end together" therefore
holds only to about 80 ms, and the section 5 step 8 duration check should be
"within 0.1 s", not exact. Whether YouTube trims it is only answerable by uploading —
which is the M0 test the owner still has to run.

### Bitrates came out far below the targets, because of the content

Measured averages were 97 kbps video and 54 kbps audio against targets of 1.5 Mbps and
256 kbps. That is content, not a bug: a static frame at 1 fps and a pure 440 Hz sine are
the easiest possible inputs, and both tracks used variable bitrate. Real music and real
artwork will land much higher. If the 256–320 kbps audio range in section 5 is a hard
requirement rather than a ceiling, set `bitrateMode: 'constant'` on the audio Quality.

### How this was verified without ffprobe

`ffprobe`, `ffmpeg` and `MediaInfo` are **not installed on this machine**, so section 5
step 8 cannot be run as written yet. Instead the probe checks the same properties two
independent ways: a byte-level MP4 box reader (`tools/m0-probe/mp4.mjs`, written for
this) reports box order, `elst` presence, sample entries, dimensions, sample rates, sample
counts and durations; then Chrome plays the file over HTTP with Range requests and every
packet is decoded through Mediabunny. Install one of those tools before M1's acceptance
run to get the spec's literal check.

## Reliability repairs — 17 October 2026

The regression suite (`npm test`, Node 24.7+ with the installed TypeScript loader)
now exercises actual upload recovery, JWT/session boundaries and cookie persistence,
owner guards/API errors, metadata rules, timezone edge cases, and probe acceptance.
CI runs it on pushes and pull requests without any real Google credentials.

- Retry/status recovery preserves completed video IDs, never guesses an upload offset,
  bounds no-progress/network retries, respects Retry-After, and propagates cancellation.
- YouTube handlers use Auth.js response wrappers to persist refreshed JWT cookies;
  failed refreshes return actionable 401. Public `/api/auth/session` exposes neither token.
- Browser clock/timezone initialization is hydration-safe; impossible/ambiguous DST
  schedules are rejected. API validation issues are displayed and init can be cancelled.
- Required codec/render/decode/playback/MP4 checks make the probe exit nonzero. Optional
  unsupported exploratory Quality variants remain diagnostic, not mandatory failures.
- `M0_OUTPUT_DIR` isolates fresh probe artifacts; default output paths are unchanged.

These local repairs do **not** establish the deployed publishing acceptance criteria.

## Real M0 acceptance record — still open

Before M1, record all of the following from an owner-authorized production test:

- [ ] Production URL and tested date/browser; OAuth callback and consent-screen status.
- [ ] Nonowner denial and correct intended channel ID/name.
- [ ] Actual Cloud Console Video Uploads quota and usage (not just the default docs).
- [ ] Five-second MP4 video ID, UTC publishAt, initial privacy/processing state.
- [ ] Data PUT response, nonfinal 308 exposed Range and status-query behavior using
      the 256 KiB chunk option and a sufficiently large file; interruption resumes
      without creating a second video.
- [ ] Processing/1 fps playback result and privacy after the scheduled instant.
- [ ] Any actual project restrictions and their remedy; explicit owner approval for M1.

## Historical verification performed — 13 October 2026

`npm run build` and `eslint .` both pass. The M0 app was then run with `next dev` and
checked over HTTP:

| Request | Result |
| --- | --- |
| `GET /` | `200`, renders "BeatFlow" and the sign-in button |
| `GET /generate` (no session) | `307` → `/api/auth/signin?callbackUrl=…` |
| `GET /api/youtube/channel` (no session) | `307` → sign-in (proxy layer) |
| `GET /api/youtube/channel` (proxy matcher temporarily narrowed) | `401 {"error":"Not signed in."}` (route layer) |
| `POST /api/youtube/init-upload` (proxy matcher narrowed) | `401 {"error":"Not signed in."}` (route layer) |
| `GET /api/auth/providers` | Google provider registered |

Both defence layers were confirmed independently, so risk 4 holds even if the matcher is
ever changed.

## Environment note

The first `npm install` was interrupted and left
`node_modules/@next/swc-darwin-x64/next-swc.darwin-x64.node` truncated
(66.8 MB on disk against 89.9 MB declared in its Mach-O headers). Every `next build` and
`next dev` died with `SIGBUS` inside dyld. Reinstalling that one package fixed it. If the
crash ever returns, check that file's size first.
