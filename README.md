# BeatFlow

Personal YouTube publishing tool for one channel. An MP3 and a background photo go in,
a 1080p MP4 comes out, rendered in the browser, and the file uploads straight from the
browser to YouTube on a schedule.

Single user. No multi-user support. Build order and acceptance criteria live in
`BeatFlow — Build Spec for the Coding Agent.md`.

## Stack

| Area | Choice |
| --- | --- |
| App | Next.js 16 (App Router) + TypeScript, deployed on Vercel |
| Styling | Tailwind CSS v4 |
| Auth | Auth.js v5 (`next-auth@beta`) with Google OAuth, owner-only |
| Rendering | Mediabunny + WebCodecs, in the browser (M1) |
| Validation | zod |
| Storage | None in v1 — MP4 held as an in-memory Blob, history in IndexedDB |

## Current state

**M0 — pipeline proof.** Owner-only Google sign-in, channel lookup, and a test upload
that starts a resumable session on the server and PUTs the file from the browser.

M1 and later are not started. See `M0-FINDINGS.md` for the section 3 and section 12
research answers, including two items that must be settled by a real upload before M1
is worth building.

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
npm run dev
```

`http://localhost:3113` is the port used during M0 verification; plain `npm run dev`
uses 3000.

## Structure

```
auth.config.ts            Edge-safe Auth.js config (Google provider, owner gate)
auth.ts                   Node Auth.js instance (refresh-token handling)
proxy.ts                  Next 16 proxy, replaces middleware.ts
app/
  page.tsx                Sign-in entry point
  generate/page.tsx       M0 test page: channel + scheduled test upload
  api/auth/[...nextauth]/route.ts
  api/youtube/channel/route.ts       channel name and avatar
  api/youtube/init-upload/route.ts   starts the resumable session
lib/
  owner.ts                single-owner identity checks
  require-owner.ts        route-handler guard
  time.ts                 timezone helpers, shared by browser and server
  youtube/api.ts          YouTube fetch helpers
  youtube/metadata.ts     field validation (zod) and the videos.insert body
  youtube/uploader.ts     browser-side chunked resumable upload
types/next-auth.d.ts      session and JWT augmentation
```

`lib/renderer/` does not exist yet; M1 adds it. It must stay free of React imports so
the engine can be tested and reused.

## Security

- Every `/api/youtube/*` route calls `requireOwner()`, and `proxy.ts` rejects non-owner
  sessions before the request arrives. Both layers are deliberate.
- `OWNER_EMAIL` fails closed: when it is unset, nothing is authorized.
- The Google refresh token lives only in the encrypted Auth.js JWT. It is never copied
  onto `Session` and never reaches the browser.
- The MP4 never passes through an API route, so Vercel's ~4.5 MB body limit does not apply.
- HTTPS only — WebCodecs needs a secure context.
