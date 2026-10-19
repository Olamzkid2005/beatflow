# BeatFlow

Personal YouTube publishing tool for one channel. An MP3 and a background photo go in,
a 1080p MP4 comes out, rendered in the browser, and the file uploads straight from the
browser to YouTube on a schedule.

Single user. No multi-user support. Build order and acceptance criteria live in
`docs/BeatFlow — Build Spec for the Coding Agent.md`.

## Stack

| Area | Choice |
| --- | --- |
| App | Next.js 16 (App Router) + TypeScript, deployed on Vercel |
| Styling | Tailwind CSS v4 |
| Auth | Auth.js v5 (`next-auth@beta`) with Google OAuth, owner-only |
| Rendering | Mediabunny + WebCodecs; self-hosted FFmpeg.wasm compatibility encoder |
| Validation | zod |
| Editor | React Konva manipulation overlay + shared deterministic Canvas renderer |
| Storage | Local IndexedDB templates/assets/approved jobs/MP4s/history; producer defaults in localStorage; no cloud backup |

## Template Studio and batch automation

- **`/templates`**: start from any preset or a blank 1920×1080 canvas. Use the
  Elements/Layers, canvas, and Properties panels to edit text, images/logos, shapes,
  waveform/progress and Orbital layers. Drag, resize, rotate, nudge, group, align,
  lock/hide/reorder; undo/redo; add fades and eased property keyframes; scrub/play.
- Save, duplicate, rename, delete, choose a default, or export/import portable
  `.beatflow.json` packages with embedded images. Branding inherits global or master
  defaults; cycles are rejected. Variables include `track_name`, `filename`,
  `producer_name`, `bpm`, `key`, `year`, `purchase_url`, and `message_text`.
  BPM/key are supplied metadata, never guessed from audio.
- **`/batch`**: add MP3/WAV files, choose a default/per-track template and artwork,
  edit titles/descriptions/tags, and preview recurring weekly publication slots in
  an IANA timezone. Known jobs/history reserve slots; DST gaps/repeats are skipped.
  Review dates and explicitly approve once, then press **Start approved queue**.
- Approval atomically stores independent scene, branding, variables and local media
  snapshots. Rendering/uploading is sequential with cross-tab Web Locks. Pause/reload
  retains completed MP4s and resumable sessions. Resume queries the existing session
  before sending bytes; accepted IDs prevent repeat uploads. Unknown outcomes require
  channel reconciliation or explicit confirmation that no video exists.
- Export-only batches never upload; enabling the checkbox later cannot authorize an
  export-only job retroactively. Accepted/processing/scheduled/published/private/
  unlisted/failed/unknown states are distinct. YouTube, not a browser timer, handles
  future publication after acceptance. A date less than 10 minutes away is rejected
  before new upload initialization.

**Limits:** keep the tab open; no closed-browser/background automation, cloud backup,
external-channel calendar discovery, or multi-user isolation. Browser eviction or clearing
site data can erase all local work. Export template backups. Static exports keep the
15-minute cap, animated exports 5 minutes; audio 64 MiB. FFmpeg is a slower compatibility
path with a 96 MiB staged-frame and 208 MiB output guard, not a promise that long animated
tracks will fit. WebCodecs remains preferred. No long-form resource claim is made for
arbitrary custom documents or the compatibility encoder.

Run `npm run build && npm run studio:check` for production Chrome acceptance with synthetic
audio, actual editor/file controls, real MP4 rendering/readback, and mocked YouTube.
Use `npm test`, `npm run lint`, `npm run a11y:check`, `npm run motion:check`, and
`npm run upload:check` for the other regression paths. No check publishes a video.
Live deployed Google OAuth/CORS/quota/processing/publication acceptance remains separate.

## Earlier milestones (historical evidence; the editor/batch section above supersedes missing-feature notes)

**M0 — pipeline proof.** Owner-only Google sign-in, channel lookup, and a test upload
that starts a resumable session on the server and PUTs the file from the browser. The
studio shell now includes an upload desk, local upload history, and producer defaults
for new uploads. A real owner upload reached the channel, but the browser could not read
any data-PUT response, so an unknown upload outcome is reported as such instead of as a
failure — see `docs/M0-FINDINGS.md` section 7.

**M1 — render proof (in progress).** `lib/renderer/` turns an MP3 plus a background photo
into a 1080p MP4 in the browser (Mediabunny + WebCodecs) with a live preview that plays the
original MP3 alongside the canvas, stage progress, cancel, download, and a hand-off into
the upload desk. The 3- and 10-minute renders, the five-render memory check, and VLC
playback of a rendered file are measured (`docs/progress.md`). The encoded pixels are
converted from the sRGB transfer function to BT.709 and the H.264 `colr` box and SPS VUI
are both tagged limited-range BT.709. Deployed CORS, the unreadable
upload response, scheduled publication/processing, and the owner's actual quota remain
unverified; uploading a rendered file to YouTube by hand is still to be recorded. See
`docs/M0-FINDINGS.md` for the section 3 and section 12 research answers and the real-project
acceptance checklist.

**M3 — metadata and publishing (in progress).** The per-upload form, timezone-aware
scheduling, and the chunked direct upload are in place, and the result is now recorded in
IndexedDB (`lib/history.ts` over `lib/history-store.ts`, migrating the earlier
localStorage rows) with up to 50 entries per browser. Because the browser still cannot
read a resumable session's response, an unknown upload outcome is recoverable: the desk
asks `POST /api/youtube/latest-upload`, which looks at the channel's uploads playlist
(`channels.list` + `playlistItems.list`, 2 quota units, never `search.list`) and returns
every same-title upload inside the attempt window. Nothing is recorded until the owner
confirms the right candidate; a miss leaves the outcome unknown. A confirmed ID keeps its
privacy and schedule marked unverified instead of copying the request's intent. History now
also has **Refresh from YouTube**, which reads the real privacy, upload, processing and
schedule state through `POST /api/youtube/video-status` (one `videos.list` call) and stores
it durably; publication is only claimed after that check. Still open: a real run against
the owner's channel.

**M4 — polish (in progress).** Producer defaults live in `/settings` and seed the next
upload. A finished render is only released when the user agrees — replacing or discarding
it asks first — and the tab warns before closing or reloading while a render or upload is
running. A render and upload are rejected before decoding when a photo exceeds 32 MP or
audio exceeds 64 MiB / 15 minutes; large photos are downscaled during decode. The upload
lifecycle lives in `lib/use-upload-job.ts`, and the form's hints/errors are linked with
`aria-describedby`. A real 5-minute beat rendered at **1067 MiB peak renderer memory** on
an 8 GB 2013 MacBook Air (1536 MiB budget), with +4 MiB retained across five render/discard
cycles. Automated WCAG A/AA passes with no violations; a screen-reader pass is still open.

**M2 — template engine (in progress).** Templates are data, validated by zod v1 before
anything renders: `First Light` (lower third), `Pulse` (centred title) and `Grid`
(editorial split) ship in `lib/templates/`, and the studio's picker switches the live
preview instantly. Title auto-fit shrinks and wraps to three lines, and a 6000 px photo is
downscaled to 1920 px before it is drawn. Verified in Chrome; still to exercise on the
deployed origin with a real track, and the Konva editor the schema was kept independent
for is later work.

**M2b — audio-reactive Orbital.** A fourth preset, `Orbital`, is the first schema-v2
template: a bounded `orbital-field` graphic (rings, markers, stipple) that reacts to the
track. Analysis is a pure, versioned pass over the decoded 48 kHz PCM — full-band RMS plus
three broad bands (40–180, 180–2000, 2000–12000 Hz) at a 60 Hz hop, −60 dBFS floor, 10 ms
attack / 160 ms release — run in a bundled module Worker one second of audio per request,
with a main-thread fallback and a generation counter so a cancelled track cannot land
late. The scene is a pure function of saved settings, absolute track time and sampled
features, so seeking to 42 s draws the same frame playback would reach. The resolved
profile is 30 fps for animated scenes (5-minute cap, 3 Mbps) and the proven 1 fps path for
static ones; asking for a different fps on an animated scene is rejected instead of
silently downgraded. Every frame is redrawn, converted to BT.709 and encoded with
`latencyMode: "quality"`, with a 192 MiB packet budget plus 16 MiB mux allowance. The
studio exposes BPM/key/message (display metadata only, never inferred), appearance sliders,
a motion toggle and Shuffle pattern, and plays the source MP3 against a canvas driven by
`currentTime`; before analysis finishes it shows a still design preview. Measured on the
8 GB 2013 MacBook Air target, against a 1536 MiB renderer budget: 30 s beats peaked at
928–1216 MiB renderer memory (53–116 s wall) across four runs, 3 minutes at 1021 MiB in
584.6 s, and the full 5-minute cap — 9000 frames at 30 fps — at **1046 MiB in 1175.8 s**
(19.6 min). Peak readings move by a couple of hundred MiB between runs, so the evidence
against per-frame growth is that the 5-minute peak lands in the same band as the 30 s ones
(and 537 MiB is retained after discard), not a rise with track length. Five 30 s
render/discard cycles peaked at 956/955/946/950/977 MiB with +5 MiB retained from the
first reading to the last.
`npm run motion:check` proves the preview reacts (and reproduces on seek) and that a 6 s
export contains 180 frames at 30 fps with BT.709/limited colour tags in both the `colr` box
and the SPS VUI. Still open: owner review of 1.8 vs 3 vs 4.5 Mbps motion quality, saved
presets/library, an explicit still export, and the deployed-origin pass.

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. All four are required:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client secret |
| `AUTH_SECRET` | Session encryption secret (`npx auth secret`) |
| `OWNER_EMAIL` | The only account allowed to use the tool |

Enable the **YouTube Data API v3** on the Google Cloud project and add the scopes
`youtube.upload` and `youtube.readonly` to the OAuth consent screen.

The authorized redirect URI must match exactly, on the production domain only:

```
https://<production-domain>/api/auth/callback/google
```

## Development

```bash
npm install
npm test
npm run dev
```

Local checks that need Chrome and a production build:

```bash
npm run build
npm run a11y:check    # axe WCAG A/AA + keyboard traversal
npm run memory:check  # 30 s, 3 min, 5 min renders + five cycles
# MEMORY_PROFILE=orbital MEMORY_MODE=quick measures the audio-reactive 30 fps path
# instead, with one 30 s render plus the five retention cycles
# MEMORY_PROFILE=orbital MEMORY_DURATIONS=300 MEMORY_RETENTION=0 measures only the
# 5-minute animated render (~20 min on the 2013 target); the orbital wait allows 30 min
npm run idb:check     # durability, migration, and a real two-tab replay
npm run fps:check     # 30 fps encode/readback and abort
npm run motion:check  # Orbital preview reaction, 30 fps export, BT.709 tags, cancel
npm run upload:check  # production-browser upload and guard flow
```

Use Node **24.7+** (CI uses Node 24); native tests load real TypeScript sources using
the already installed compiler, with no test framework dependency. Test credentials
and Google responses are synthetic; tests do not publish videos.

`http://localhost:3113` is the port used during M0 verification; plain `npm run dev`
uses 3000.

## M0 capability probe

```bash
npm run m0:probe          # headless
npm run m0:probe -- --headful
M0_OUTPUT_DIR=/tmp/beatflow-m0 npm run m0:probe  # preserve bundled artifacts
```

Runs `tools/m0-probe/` in the installed Chrome (override with `CHROME_PATH`) and answers
the spec's section 12 assumptions that do not need a Google account. It performs **real**
H.264 High and AAC encodes rather than trusting `isConfigSupported`, which is known to
report AAC support and then fail, then renders a 5-second 1080p MP4 through Mediabunny
and inspects the bytes.

Outputs:

- `public/beatflow-m0-test-5s.mp4` — the test video the M0 page uploads to YouTube.
- `tools/m0-probe/report.json` — the full run, including the MP4's box layout.

Required encode, decode, playback and MP4 checks fail with a nonzero exit status.
Unsupported exploratory Quality variants are reported without failing the required
supported configuration. These checks do not certify YouTube processing, BT.709/
chroma/progressive details, long-track performance or repeat-render memory behavior.

It is a test harness, not part of the app: nothing under `tools/` is imported by Next.

## Structure

```
auth.config.ts            Google provider + optimistic owner gate
auth.ts                   Public session projection + internal server auth/refresh
proxy.ts                  Next 16 proxy, replaces middleware.ts
app/
  page.tsx                Connect screen and owner access state
  (app)/
    layout.tsx            Authenticated shell + owner guard
    generate/page.tsx     Render studio + upload desk: channel, metadata, progress
    history/page.tsx      Local upload history and filters
    settings/page.tsx     Local producer defaults
  api/auth/[...nextauth]/route.ts
  api/youtube/channel/route.ts       channel name and avatar
  api/youtube/init-upload/route.ts   starts the resumable session
  api/youtube/latest-upload/route.ts suggests recovery candidates from the uploads playlist
components/
  app-shell.tsx           Header, sidebar, mobile navigation and account controls
  nav-links.tsx           Shared route navigation
  render-studio.tsx       MP3 + photo → MP4: preview, progress, cancel, hand-off
  ui/                     Studio primitives, icons and tag input
lib/
  renderer/               React-free render engine (see below)
  templates/              Preset templates, one per file
  owner.ts                single-owner identity checks
  require-owner.ts        route-handler guard
  time.ts                 timezone helpers, shared by browser and server
  history.ts              upload history wiring (IndexedDB, migration, events)
  history-store.ts        history controller, IndexedDB adapter, memory fallback
  settings.ts             browser-local producer defaults (storage injectable)
  use-before-unload.ts    unload guard for running renders and uploads
  use-channel.ts          client channel fetch hook
  youtube/api.ts          YouTube fetch helpers
  youtube/metadata.ts     field validation (zod) and the videos.insert body
  youtube/reconcile.ts    pure matcher for recovering a video id (tested in Node)
  youtube/uploader.ts     browser-side chunked resumable upload
types/next-auth.d.ts      session and JWT augmentation
tools/m0-probe/           Chrome capability probe (test-only, not part of the app)
  run.mjs                 serves the page, drives headless Chrome over CDP
  probe.html              the in-browser checks
  mp4.mjs                 byte-level MP4 box reader, used instead of ffprobe
  server.mjs              localhost server with Range support
public/
  beatflow-m0-test-5s.mp4 5-second 1080p test video from the probe
```

`lib/renderer/` holds the render engine and stays free of React imports so it can be
tested and reused: `template-schema.ts` (zod v1 schema and interpolation), `assets.ts`
(decode, downscale, fonts), `scene.ts` (`drawScene`, `layoutText`), `audio.ts` (MP3
decode), `capabilities.ts` (encoder checks), `encode.ts` (Mediabunny MP4), `index.ts`
(`renderVideo`, `previewFrame`). `lib/templates/` holds the presets and
`components/render-studio.tsx` is the UI that drives them. `lib/templates/index.ts`
lists the presets the picker offers; adding one is a new file plus an entry there.

## Security

- Every `/api/youtube/*` route calls `requireOwner(request.auth)`, and `proxy.ts` rejects non-owner
  sessions before the request arrives. Both layers are deliberate.
- `OWNER_EMAIL` fails closed: when it is unset, nothing is authorized.
- The Google refresh token lives only in the encrypted Auth.js JWT. Public session
  responses expose neither Google token. Internal server sessions include only the
  access token; route wrappers persist refreshed JWT cookies on their response.
- API authentication failures return JSON 401/403 rather than HTML redirects.
- Cancellation stops local work, not a video already accepted by YouTube; check Studio
  before retrying an uncertain final result. DST gaps/repeated times are rejected.
- The MP4 never passes through an API route, so Vercel's ~4.5 MB body limit does not apply.
- HTTPS only — WebCodecs needs a secure context.
