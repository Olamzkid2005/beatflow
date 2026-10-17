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
for new uploads.

M1 and later are not started. See `docs/M0-FINDINGS.md` for the section 3 and section 12
research answers and the real-project acceptance checklist. Deployed CORS, scheduled
publication/processing, and the owner's actual quota remain unverified. M0 reliability
repairs do not start M1 or replace that acceptance run.

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
    generate/page.tsx     Upload desk: channel, preview, metadata, progress
    history/page.tsx      Local upload history and filters
    settings/page.tsx     Local producer defaults
  api/auth/[...nextauth]/route.ts
  api/youtube/channel/route.ts       channel name and avatar
  api/youtube/init-upload/route.ts   starts the resumable session
components/
  app-shell.tsx           Header, sidebar, mobile navigation and account controls
  nav-links.tsx           Shared route navigation
  ui/                     Studio primitives, icons and tag input
lib/
  owner.ts                single-owner identity checks
  require-owner.ts        route-handler guard
  time.ts                 timezone helpers, shared by browser and server
  history.ts              browser-local upload history
  settings.ts             browser-local producer defaults
  use-channel.ts          client channel fetch hook
  youtube/api.ts          YouTube fetch helpers
  youtube/metadata.ts     field validation (zod) and the videos.insert body
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

`lib/renderer/` does not exist yet; M1 adds it. It must stay free of React imports so
the engine can be tested and reused.

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
