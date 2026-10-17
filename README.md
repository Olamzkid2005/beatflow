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
| Rendering | Mediabunny + WebCodecs, in the browser (M1) |
| Validation | zod |
| Storage | No server storage — MP4 held as an in-memory Blob; history and producer defaults in browser local storage |

## Current state

**M0 — pipeline proof.** Owner-only Google sign-in, channel lookup, and a test upload
that starts a resumable session on the server and PUTs the file from the browser. The
studio shell now includes an upload desk, local upload history, and producer defaults
for new uploads. A real owner upload reached the channel, but the browser could not read
any data-PUT response, so an unknown upload outcome is reported as such instead of as a
failure — see `docs/M0-FINDINGS.md` section 7.

**M1 — render proof (in progress).** `lib/renderer/` turns an MP3 plus a background photo
into a 1080p MP4 in the browser (Mediabunny + WebCodecs) with a live preview, stage
progress, cancel, download, and a hand-off into the upload desk. Deployed CORS, the
unreadable upload response, scheduled publication/processing, and the owner's actual
quota remain unverified; uploading a rendered file to YouTube by hand is still to be
recorded. See `docs/M0-FINDINGS.md` for the section 3 and section 12 research answers and
the real-project acceptance checklist.

**M3 — metadata and publishing (in progress).** The per-upload form, timezone-aware
scheduling, and the chunked direct upload are in place, and the result is now recorded in
IndexedDB (`lib/history.ts` over `lib/history-store.ts`, migrating the earlier
localStorage rows) with up to 50 entries per browser. Because the browser still cannot
read a resumable session's response, an unknown upload outcome is recoverable: the desk
asks `POST /api/youtube/latest-upload`, which looks at the channel's uploads playlist
(`channels.list` + `playlistItems.list`, 2 quota units, never `search.list`) and matches
the newest upload with the same title inside a short window. It never guesses an ID, and a
miss leaves the outcome unknown. Still open: a real run against the owner's channel.

**M4 — polish (in progress).** Producer defaults live in `/settings` and seed the next
upload. A finished render is only released when the user agrees — replacing or discarding
it asks first — and the tab warns before closing or reloading while a render or upload is
running. An unreadable photo blocks the render with a clear message instead of failing
later. Still to review on a real device.

**M2 — template engine (in progress).** Templates are data, validated by zod v1 before
anything renders: `First Light` (lower third), `Pulse` (centred title) and `Grid`
(editorial split) ship in `lib/templates/`, and the studio's picker switches the live
preview instantly. Title auto-fit shrinks and wraps to three lines, and a 6000 px photo is
downscaled to 1920 px before it is drawn. Verified in Chrome; still to exercise on the
deployed origin with a real track, and the Konva editor the schema was kept independent
for is later work.

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
  api/youtube/latest-upload/route.ts recovers the video id from the uploads playlist
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
