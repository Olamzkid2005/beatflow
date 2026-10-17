# BeatFlow — Build Spec for the Coding Agent

Prepared 12 Oct 2026 · Single-user tool · Next.js on Vercel · Video rendered in the browser

## 0. Instructions to the agent

- Build in the milestone order in section 9. After each milestone, stop, report results against its acceptance criteria, and wait for approval.
- Do not start M1 until M0 has answered the YouTube questions in section 3.
- Do not add dependencies, servers, databases or services that are not listed here without asking first.
- Section 12 lists unverified assumptions. Check them against current documentation and report what you find instead of assuming.
- Keep `lib/renderer/` free of React imports so the engine can be tested and reused.

## 1. Product goal

The owner (one person) uses the deployed site to:

1. Link their YouTube channel through Google sign-in.
2. Upload an MP3 and a background photo.
3. Pick a design template. The track name and branding are inserted automatically.
4. Enter the YouTube title, description, tags, visibility and scheduled publish date and time. Every field is editable per upload.
5. Click Generate. The browser renders a 1080p MP4, shows a preview, and offers a download to the local computer.
6. Click Publish. The MP4 uploads to YouTube and is scheduled.

Rendering must stay light on CPU and RAM, even on an older laptop.

## 2. Decisions already made

| Area | Decision |
| --- | --- |
| Users | Personal tool for the owner's own channel only. No multi-user support. |
| App | Next.js (App Router) + TypeScript, deployed on Vercel. Tailwind + shadcn/ui. |
| Rendering | In the browser. No server-side rendering, no Python backend, no FFmpeg server. |
| Video library | Mediabunny with WebCodecs (H.264 + AAC). No FFmpeg.wasm. |
| Browsers | Current desktop Chrome and Edge only. |
| Concurrency | One render at a time. |
| Upload to YouTube | Direct from the browser, using a resumable session started by the server. |
| Auth | Auth.js with Google OAuth, restricted to the owner's account. |
| Storage | No Vercel Blob, Postgres, Redis or queue in v1. Templates and history live in IndexedDB. |
| Templates | Versioned JSON validated with zod. 2–3 hard-coded presets in v1. No drag-and-drop editor in v1. |
| Animation | None in v1 (static design). Write the renderer so animation can be added later. |
| Generated video | Held as an in-memory Blob. Released when the next upload starts. |

## 3. Risks to settle first (Milestone 0)

> Research update, 17 October 2026: the current official `videos.insert` reference
> says unverified-project uploads are **not** restricted to private viewing. Its quota
> reference confirms a separate 100-call/day Video Uploads bucket. Item 1 below records
> the original risk assumption, not verified current policy. Follow the refreshed
> evidence and acceptance checklist in `M0-FINDINGS.md`; a real scheduling/CORS/project
> quota result and milestone approval are still required before M1.

1. **Audit lock.** Videos uploaded through the API from an unverified Google Cloud project created after 28 July 2020 are locked to private until the project passes a compliance audit. Test whether a scheduled video (private + `publishAt`) still goes public on schedule. If it does not, apply for the audit before building anything else.
2. **Quota.** Sources conflict. Older sources say one upload costs 1,600 of 10,000 daily units (about 6 uploads a day). Google's current quota page says `videos.insert` has its own bucket of 100 calls a day. Read the real number in the Google Cloud Console and record it.
3. **OAuth Testing mode.** In Testing status, refresh tokens expire after 7 days. Set the consent screen to In production. The unverified-app warning is acceptable for a single user.
4. **Open API routes.** Every route handler must reject anyone except the owner (`OWNER_EMAIL`). Otherwise anyone who finds the URL can upload to the channel.
5. **Redirect URIs.** Google needs exact matches and Vercel preview URLs change on every deploy. Run OAuth on the production or custom domain only.
6. **Body limit.** Vercel Functions reject request bodies above roughly 4.5 MB. The MP4 must never pass through an API route.
7. **Browser upload CORS.** Confirm the browser can send chunks to the YouTube resumable session URI from the deployed origin. If not, fall back to giving the browser a short-lived access token (never the refresh token).

## 4. Architecture

```
Browser (Next.js client)                  Vercel (route handlers only)
------------------------                  ----------------------------
Upload MP3 + image                        /api/auth/*               Auth.js Google OAuth, owner only
Pick template (JSON)                      /api/youtube/channel      channel name and avatar
Metadata form                             /api/youtube/init-upload  start resumable session, return session URI
Preview (canvas + audio element)
Generate -> MP4 Blob (Mediabunny)
Download (a download link)
PUT MP4 -> YouTube session URI (direct)
```

Project structure:

```
app/
  generate/page.tsx
  api/auth/[...nextauth]/route.ts
  api/youtube/channel/route.ts
  api/youtube/init-upload/route.ts
lib/renderer/
  template-schema.ts   zod schema with schemaVersion
  scene.ts             drawScene(ctx, template, vars, assets), shared by preview and export
  assets.ts            font and image loading
  audio.ts             MP3 decode
  encode.ts            Mediabunny Output -> MP4
  capabilities.ts      startup feature checks
  index.ts             renderVideo(), previewFrame()
lib/youtube/
  uploader.ts          resumable upload, chunking, retry
  metadata.ts          field validation
lib/templates/         2-3 hard-coded preset templates (JSON)
```

## 5. Video generator

### Interface

```ts
renderVideo(
  input: { audio: File; background: File; template: Template; vars: Record<string, string> },
  opts: { fps?: number; signal: AbortSignal; onProgress: (stage: string, pct: number) => void }
): Promise<Blob>   // video/mp4

previewFrame(canvas, template, vars, assets): void   // same drawScene as export
```

### Output format (required)

- Container: MP4 with the `moov` atom at the front of the file (fast start), no edit lists, even dimensions.
- Video: H.264 High profile `avc1.640028`, 1920×1080, progressive, 4:2:0, tagged BT.709.
- Frame rate: configurable, default 1 fps. Benchmark 1, 5 and 24 fps and keep the lowest that YouTube processes and plays correctly.
- Video bitrate about 1.5–2 Mbps. Keyframe roughly every 2 seconds.
- Audio: AAC-LC, stereo, 48 kHz, 256–320 kbps.
- Video and audio end together: the last frame's duration is the remaining time.
- Expected file size: mostly audio, about 2.4 MB per minute at 320 kbps.

### Pipeline

1. **Capability check at startup.** Confirm H.264 `avc1.640028` at 1920×1080 and AAC (`mp4a.40.2`, 48 kHz, stereo) can be encoded. Use `VideoEncoder.isConfigSupported` and `AudioEncoder.isConfigSupported`, or Mediabunny's support-check helpers. If either fails, show a clear message and disable Generate.
2. **Validate inputs by content, not extension.** The MP3 must decode, with duration and channel count readable. Enforce a configurable maximum duration (default 15 minutes). Limit image pixel count. Reject corrupt files.
3. **Load assets.** Call `await document.fonts.load('700 110px Montserrat')` before drawing (self-host fonts with next/font), or the export silently uses a fallback font. Decode the photo with `createImageBitmap`, downscaled so the long edge is at most 1920 px, then cover-fit it with an adjustable crop offset.
4. **Compose once.** Draw the full 1920×1080 frame onto one canvas with `drawScene`: background, dark overlay, title, branding. For text, wrap by words (max 3 lines) and shrink from `fontSize` toward `minFontSize` until `measureText` fits `maxWidth`. Support uppercase, `ctx.letterSpacing`, shadow and outline.
5. **Decode audio.** Create `new AudioContext({ sampleRate: 48000 })` and call `decodeAudioData`, which resamples to 48 kHz. Memory is about 23 MB per minute (3 min is about 70 MB, 10 min about 230 MB). Close the context afterwards and drop the buffer when done. Web Audio does not exist in Workers, so this runs on the main thread in v1.
6. **Encode.** Create a Mediabunny `Output` with `Mp4OutputFormat` and `BufferTarget`. Add a `CanvasSource` video track and an `AudioBufferSource` audio track, then `await output.start()`. Add one frame every `1 / fps` seconds with `await videoSource.add(t, 1 / fps)` on the same canvas, from `t = 0` to just under the audio duration. Await every `add()` call, because that is the backpressure. Then `await audioSource.add(audioBuffer)` and `await output.finalize()`.
7. **Output.** Build `new Blob([output.target.buffer], { type: 'video/mp4' })`. Preview with `URL.createObjectURL`. Download with an `<a download>` link.
8. **Verify (in tests).** With ffprobe or MediaInfo confirm: H.264 High, AAC 48 kHz, 1920×1080, duration equal to the MP3 within 0.1 s, `moov` before `mdat`, and no `elst` (edit list) box.

### Library notes

- Use the `mediabunny` npm package: `Output`, `Mp4OutputFormat`, `BufferTarget`, `CanvasSource`, `AudioBufferSource`, `output.addVideoTrack`, `output.addAudioTrack`, `output.start`, `output.finalize`.
- Confirm the exact option names for codec, bitrate, keyframe interval and fast start in the Mediabunny docs.
- Set fast start explicitly so `moov` is at the front of a non-fragmented file. Do not use the `'fragmented'` mode.
- If AAC encoder delay produces an edit list, find a muxer option that avoids it, or test whether YouTube still processes the file correctly.
- Do not use FFmpeg.wasm.

### Threading

Run on the main thread in v1. For a static image the browser's encoder threads do the heavy work and the main thread only submits a few hundred frames. Keep the code free of DOM assumptions where practical so it can move into a Worker with OffscreenCanvas when animation is added.

### Memory and cleanup rules

- One render at a time. Never hold decoded video frames.
- Decode the background image once and reuse it. Downscale oversized images before drawing.
- Close every `VideoFrame`, `AudioData` and `ImageBitmap` you create. Close the AudioContext.
- Revoke previous object URLs and drop the previous Blob when a new upload starts.
- If a YouTube upload is in progress, ask before discarding the previous video.
- Cleanup applies only to BeatFlow's in-memory data. Never touch files the user downloaded or videos already on YouTube.

### Preview

Live preview: call `previewFrame` on a visible canvas whenever the title, image or template changes, and play the original MP3 in an audio element. Do not encode a video for this. After export, show the MP4 in a video element.

### State and cancel

States: `idle` → `rendering` → `done`, with `failed` and `cancelled` as exits. Cancel through an `AbortSignal`: stop adding frames, cancel the Mediabunny output, release resources, return the UI to idle. A cancelled or failed render must never leave something that looks like a finished video. Progress is stage-based: decode, video, audio, finalize.

## 6. Template schema (version 1)

Validate with zod before rendering. Never evaluate code from a template.

- Root: `schemaVersion` (1), `name`, `canvas` (`width`, `height`, `backgroundColor`), `layers[]`.
- Layer `image`: `binding` (`background_image` or `logo`), `fit` (`cover` or `contain`), `offsetX`, `offsetY`, `opacity`.
- Layer `rect`: `x`, `y`, `width`, `height`, `fill`, `opacity`, `radius`.
- Layer `text`: `value` (may contain `{{variables}}`), `x`, `y`, `maxWidth`, `fontFamily`, `fontWeight`, `fontSize`, `minFontSize`, `color`, `align`, `uppercase`, `letterSpacing`, `shadow`, `outline`.
- Variables: `track_name` (from the filename, editable), `filename`, `producer_name` (from settings). `bpm`, `key`, `year` and `purchase_url` exist only if the user supplies them. Never invent values.
- Rules: unknown bindings fail validation. Maximum 30 layers. Fonts come from an allow-list. Snapshot the template at render time so later edits do not change an in-progress render.
- Keep the schema independent of any editor library so a Konva editor can be added later without migrating saved templates.

## 7. YouTube integration

### Auth

- Auth.js Google provider with scopes `youtube.upload` and `youtube.readonly`. Request `access_type=offline` and `prompt=consent` to receive a refresh token.
- Keep the refresh token server-side (encrypted Auth.js session). Never send it to the browser. Access tokens last about an hour.
- Show the channel name and avatar using `channels.list` with `mine=true`.

### Upload

1. The browser sends the metadata and file size to `POST /api/youtube/init-upload`.
2. The server starts a resumable session with `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, sending `X-Upload-Content-Length`, `X-Upload-Content-Type: video/mp4` and a JSON body. The `Location` response header is the session URI. Return it to the browser.
3. The browser PUTs the file to the session URI in chunks (multiples of 256 KiB), with retry and resume (query status with `Content-Range: bytes */total`). Show progress.
4. On success, save the `videoId`, title and publish time in IndexedDB.

### Metadata rules

- Title required, at most 100 characters, no `<` or `>`.
- Description at most 5,000 bytes. Tags at most 500 characters in total.
- `categoryId` 10 (Music). `selfDeclaredMadeForKids: false`.
- Immediate publish: `privacyStatus` public or unlisted.
- Scheduled publish: `privacyStatus: 'private'` plus `publishAt` as UTC ISO 8601, for example 2026-10-20T17:00:00Z for 6:00 PM in Lagos. Convert from the chosen timezone (default to the browser's via Intl) and reject times in the past.
- Custom thumbnails are a later feature (`thumbnails.set`, which needs a verified channel).
- The tab must stay open until the upload finishes. Once YouTube accepts the video, YouTube handles publication.

## 8. Vercel and security

- Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `OWNER_EMAIL`. Never expose secrets to client code.
- Middleware and every route handler check the session email against `OWNER_EMAIL`.
- HTTPS only (WebCodecs needs a secure context).
- No COOP/COEP headers are needed, because FFmpeg.wasm is not used.
- OAuth redirect URI is registered only for the production domain.

## 9. Milestones and acceptance criteria

**M0: YouTube proof.** Deploy a minimal page to Vercel with owner-only Google sign-in. Show the channel name. Upload a 5-second test MP4 with `publishAt` about 10 minutes ahead. Record: is the video locked private, is the schedule honored, what is the real quota, does browser CORS work. Done when section 3 items 1, 2 and 7 have written answers.

**M1: Render proof of concept.** One hard-coded template. MP3 + image in, MP4 out, preview, download, cancel, cleanup. Done when:

- 3-minute and 10-minute MP3s produce files that pass the section 5 step 8 checks and play in Chrome and VLC.
- A rendered file uploaded manually to YouTube processes correctly at the chosen fps.
- Five sequential renders do not grow memory (check in Chrome's task manager).
- Cancel returns the UI to idle with no leaked object URLs.
- A browser without H.264 or AAC encoding shows a clear message instead of failing.

**M2: Template engine.** Schema and zod validation, 2–3 presets, variable binding, title auto-fit, live preview through `drawScene`. Done when a very long title and a 6000 px photo both render correctly.

**M3: Metadata and publishing.** Per-upload form, scheduling with timezone handling, direct upload with progress and retry, upload history in IndexedDB.

**M4: Polish.** Settings (producer name, default description and tags), error messages, discard confirmation, empty and failure states.

**Later:** Konva template editor, animation and waveforms, batch queue, thumbnails, Worker rendering.

## 10. Out of scope for v1

Server-side rendering, FFmpeg.wasm, Vercel Blob, Postgres, Redis, queues, multi-user accounts, drag-and-drop editor, animation, audio visualizers, mobile rendering, File System Access streaming, performance modes, Safari and Firefox support, a hand-written MP3 demuxer, a complex render state machine.

## 11. Test checklist

- 3-minute and 10-minute stereo MP3, plus a mono MP3.
- 44.1 kHz and 48 kHz source audio.
- Very long track title, and a very short one.
- Oversized background image (6000 px or larger).
- Cancel during rendering, then render again.
- Start another upload while a video exists: previous Blob and URL released.
- Download produces a valid local file.
- Unsupported codec: clear error, resources released.
- Five sequential renders: no memory growth.
- Past schedule time is rejected. Timezone conversion is correct.
- Non-owner Google account is rejected by every route.

## 12. Unverified assumptions (check, then report)

- Mediabunny option names for bitrate, keyframe interval and fast start.
- Whether Chrome on the owner's machine can encode AAC through WebCodecs.
- Whether YouTube processes and plays a 1 fps video correctly.
- Whether AAC encoder delay creates an edit list in the output.
- The real `videos.insert` quota for this Google Cloud project.
- Whether scheduled publishing works before the API audit.
- Whether the browser can PUT to the resumable session URI (CORS).

## References

- YouTube recommended upload encoding settings: https://support.google.com/youtube/answer/1722171
- YouTube Data API videos.insert: https://developers.google.com/youtube/v3/docs/videos/insert
- YouTube API quota cost: https://developers.google.com/youtube/v3/determine\_quota\_cost
- Mediabunny quick start: https://mediabunny.dev/guide/quick-start
