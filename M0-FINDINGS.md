# BeatFlow — M0 findings

Answers to section 3 (risks to settle first) and section 12 (unverified assumptions).
Checked 12 October 2026. Anything marked **open** still needs a real run against the
owner's Google Cloud project or a deployed origin.

## Section 3 — risks

### 1. Audit lock — **confirmed, and it is the biggest risk**

All videos uploaded through `videos.insert` from a Google Cloud project created
after **28 July 2020** are restricted to private until the project passes an API
compliance audit.

YouTube Help is explicit that this lock is not appealable:

> For videos that have been locked as private due to upload via an unverified API
> service, you will not be able to appeal. You'll need to re-upload the video via a
> verified API service or via the YouTube app/site. The unverified API service can
> also apply for an API audit.

The same page says a locked video's state cannot be changed until it is re-reviewed.
That is the worrying part for a scheduled upload: if the lock is applied, YouTube may
never honour `publishAt`.

**Still open:** whether `private` + `publishAt` actually fires on schedule before the
audit. This is exactly what M0's 5-second test measures. If the schedule does not
fire, the audit has to be applied for before M1 is worth building.

Sources:
- https://support.google.com/youtube/answer/7300965
- https://developers.google.com/youtube/v3/revision_history

### 2. Quota — **the spec's 1,600-unit figure is out of date**

The current quota page states:

> Projects that enable the YouTube Data API have a default quota allocation of 100
> `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined
> for all other endpoints.

> The `search.list` and `videos.insert` methods have their own quota buckets. Each of
> these methods has a default daily limit of 100 per day. The quota cost is 1 per call.

So `videos.insert` is **100 uploads a day in its own bucket**, not ~6 a day. Note the
cost table still lists 1,600 next to `videos.insert` in a table row while the page's own
summary contradicts it; the bucket sentence is the authoritative one. Quotas reset at
midnight Pacific Time and are shared per project, not per API key.

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
This cannot be settled from documentation, and `localhost` is not representative because
the session URI is issued against a specific `Origin`.

**Test in M0:** from the deployed origin, PUT one chunk and confirm the browser sees the
response. If it fails, fall back to handing the browser a short-lived access token (never
the refresh token) and documenting the failure.

## Section 12 — unverified assumptions

| Assumption | Status |
| --- | --- |
| Mediabunny option names | **Confirmed** — see below |
| Chrome can encode AAC via WebCodecs | **Partly** — see below |
| YouTube plays a 1 fps video | **Open** — needs an upload |
| AAC encoder delay creates an edit list | **Open** — needs ffprobe on a real file |
| Real `videos.insert` quota | **Open** — read it in the Cloud console |
| Scheduled publishing before the audit | **Open** — M0 test |
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

### Chrome AAC via WebCodecs

MDN states plainly that "AAC encoding support in WebCodecs has notable gaps". Chromium on
desktop does generally support `mp4a.40.2`, but there is a recent Chromium report that
**`AudioEncoder.isConfigSupported()` returns `true` for AAC and the encode then fails**.
So the capability check in section 5 step 1 is necessary but not sufficient: M1 should
follow `isConfigSupported` with a real `configure` → `encode` → `flush` of a tiny buffer
and treat a throw as unsupported.

**Still open:** whether the owner's machine encodes AAC. The capability probe answers this
on first load.

## Verification performed

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
