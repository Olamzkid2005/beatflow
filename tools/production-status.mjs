/**
 * Read-only production recorder for the owner-gated Google run.
 *
 * It never uploads and never prints the cookie. Use the session cookie from a
 * signed-in browser:
 *
 *   PRODUCTION_URL=https://your-app.example \
 *   SESSION_COOKIE="authjs.session-token=..." \
 *   VIDEO_IDS="dQw4w9WgXcQ" \
 *   node tools/production-status.mjs
 *
 * The cookie header must include the full `name=value` pair. On HTTPS use the
 * `__Secure-` prefix if that is what the browser shows. The output is safe to
 * paste into docs/M0-FINDINGS.md after the owner approves it.
 */
const baseUrl = process.env.PRODUCTION_URL;
const cookie = process.env.SESSION_COOKIE;
const ids = (process.env.VIDEO_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!baseUrl || !cookie) {
  console.error(
    "Usage: PRODUCTION_URL=https://... SESSION_COOKIE='name=value' [VIDEO_IDS=id1,id2] node tools/production-status.mjs",
  );
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(baseUrl);
} catch {
  console.error("PRODUCTION_URL is not a valid URL.");
  process.exit(2);
}
if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
  console.error("Use https for the production run (http is allowed only for localhost).");
  process.exit(2);
}
if (ids.some((id) => !/^[A-Za-z0-9_-]{11}$/.test(id))) {
  console.error("VIDEO_IDS must be comma-separated 11-character YouTube ids.");
  process.exit(2);
}

async function call(path, init = {}) {
  const response = await fetch(new URL(path, parsed).toString(), {
    ...init,
    headers: { cookie, accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const record = {
  checkedAt: new Date().toISOString(),
  origin: parsed.origin,
  channel: null,
  videos: [],
  quotaNote:
    "Read the Video Uploads bucket and daily usage in the owner's Google Cloud console; the API response does not include quota numbers.",
};

try {
  record.channel = await call("/api/youtube/channel");
  console.log(`Channel: ${record.channel.title ?? record.channel.id ?? "(unreadable)"}`);
  if (ids.length) {
    const status = await call("/api/youtube/video-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoIds: ids }),
    });
    record.videos = status.videos ?? [];
    for (const video of record.videos) {
      console.log(
        `${video.videoId}: privacy=${video.privacyStatus} upload=${video.uploadStatus ?? "?"} ` +
          `processing=${video.processingStatus ?? "?"} publishAt=${video.publishAt ?? "none"} ` +
          `failure=${video.failureReason ?? "none"}`,
      );
    }
  } else {
    console.log("No VIDEO_IDS supplied; channel only.");
  }
  console.log("\nJSON record (no cookie included):");
  console.log(JSON.stringify(record, null, 2));
} catch (error) {
  console.error(`Production check failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
