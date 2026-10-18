# Production and real-channel runbook

This is the owner-gated run that closes the remaining items in
`docs/M0-FINDINGS.md` and confirms the real Google behavior. Nothing here is
simulated: it needs the owner's Google Cloud project, the production origin,
and the owner's Google account. Do not commit the session cookie or any OAuth
secret.

## 1. Preconditions

- [ ] The production origin is deployed from the current `main` and `npm run build` passed locally.
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, and `OWNER_EMAIL` are set in the deployment.
- [ ] YouTube Data API v3 is enabled, and the OAuth consent screen is **In production** (not Testing).
- [ ] The only authorized redirect URI is `https://<production-domain>/api/auth/callback/google`.
- [ ] The owner's Cloud Console quota page is open: **YouTube Data API v3 → Quotas**. Record the **Video Uploads** bucket limit and current usage before the run.
- [ ] A signed-in Chrome window is on the production origin, and DevTools → Network is recording.

Local preflight (no Google calls):

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run a11y:check
npm run memory:check
npm run idb:check
```

## 2. Identity and owner gate

1. Sign out, then sign in with the owner Google account.
2. In DevTools, confirm `GET /api/youtube/channel` returns the intended channel ID and title.
3. In a private window, sign in with a non-owner account (or use a stale cookie) and confirm `/generate`, `/history`, `/settings`, and every `/api/youtube/*` route are denied.
4. Record the production URL, date, browser version, channel ID, and channel title.

If the owner email is rejected, check `OWNER_EMAIL` and Google's `email_verified` claim before changing code.

## 3. CORS and resumable upload on the deployed origin

Use the built-in **Sample MP4** (5 seconds, 108 KiB) with the **256 KiB — CORS / 308 test** chunk choice and a larger file when a non-final 308 is required.

- [ ] `POST /api/youtube/init-upload` returns `200` with `sessionUri`; the request body contains metadata and `fileSize` only.
- [ ] The browser PUTs directly to Google. A non-final chunk returns `308` with a `Range` response header.
- [ ] The final PUT returns `200`/`201` and the browser can read the JSON body containing the video ID.
- [ ] If the response body is unreadable, the UI says **Upload outcome unknown**, offers **Find it on my channel**, and does not claim completion. Confirm the candidate, then verify the recorded ID is the intended video.
- [ ] The browser PUT response is not visible in the Network panel if CORS blocks it; record the exact console/CORS error rather than inferring success from the upload landing.

Record whether the response was readable. This is the open item from section 7 of `docs/M0-FINDINGS.md`.

## 4. Scheduled publication and processing

1. Upload the sample as **Private with a schedule** roughly 3 minutes ahead (UTC is shown in the form).
2. Record the returned video ID, requested `publishAt`, and the initial privacy/processing state.
3. Call the recorder (read-only, no upload):

```bash
PRODUCTION_URL=https://<production-domain> \
SESSION_COOKIE='authjs.session-token=<paste-from-browser>' \
VIDEO_IDS=<video-id> \
node tools/production-status.mjs
```

4. Wait past the scheduled instant, re-run the recorder, and also press **Refresh from YouTube** on `/history`.
5. Record:
   - Actual `privacyStatus` before and after the instant.
   - `uploadStatus` and `processingStatus`.
   - The observed publication time versus the requested `publishAt`.
   - Whether playback works in YouTube Studio and whether the video is public on the channel.
6. If YouTube returns a restriction or failure reason, record the exact API values; do not assume the historical “unverified project locks uploads private” rule applies.

## 5. Quota

- [ ] Read the **Video Uploads** bucket limit and usage in the Cloud console before and after the run.
- [ ] Record the actual numbers (not the documented defaults) in `docs/M0-FINDINGS.md`.
- [ ] Note every call made by the run: one `channels.list`, the upload calls, and any `videos.list` status reads.

`/api/youtube/latest-upload` uses 2 units (`channels.list` + `playlistItems.list`) and never `search.list`. `/api/youtube/video-status` uses one `videos.list` call per refresh for up to 50 IDs.

## 6. Results record

Paste this into the “Real M0 acceptance record” in `docs/M0-FINDINGS.md` after the owner approves:

```text
Date / browser:
Production URL:
Channel ID / title:
OAuth consent screen: Production
Redirect URI registered:
Video Uploads quota limit / usage before:
Video Uploads quota limit / usage after:
Upload video ID:
Requested publishAt (UTC):
Observed privacy before / after:
uploadStatus / processingStatus:
Observed publication time:
Browser PUT response readable: yes / no
Non-final 308 Range observed: yes / no / not applicable
Recovery flow used: yes / no
Any Google restriction or failure reason:
Owner approval for M1:
```

## 7. Failure triage

| Symptom | Check first |
| --- | --- |
| 403 on every route | Owner email/`email_verified`, stale session, consent screen mode |
| 401 loop after sign-in | `AUTH_SECRET`, refresh-token expiry (Testing mode), redirect URI mismatch |
| `init-upload` 400 | Metadata limits, schedule in the past, public + schedule combination |
| PUT fails immediately | Session URI expired, chunk size not a 256 KiB multiple, origin CORS |
| 308 repeats forever | `Content-Range` total mismatch, wrong offset, file changed mid-transfer |
| Upload lands but no ID | Expected unreadable-response path; confirm via **Find it on my channel** |
| Video stays private | Check `publishAt` and processing; read actual status before assuming a project restriction |
| Quota exhausted | Video Uploads bucket, not the general unit pool |

Stop after a failure that indicates a project restriction, credential problem, or unexpected privacy state. Record the exact error and do not retry blindly.
