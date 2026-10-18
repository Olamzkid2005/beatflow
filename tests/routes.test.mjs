import assert from "node:assert/strict";
import { test } from "node:test";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";

process.env.AUTH_SECRET = "test-only-route-secret-000000000000000000000";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.OWNER_EMAIL = "owner@example.com";
const { GET } = await import("../app/api/youtube/channel/route.ts");
const { POST } = await import("../app/api/youtube/init-upload/route.ts");
const { POST: latestUpload } = await import("../app/api/youtube/latest-upload/route.ts");
const { POST: videoStatus } = await import("../app/api/youtube/video-status/route.ts");

async function request(path, body, email = "owner@example.com") {
  const token = email && await encode({ secret: process.env.AUTH_SECRET, salt: "authjs.session-token", token: { email, accessToken: "fake", expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { host: "localhost", "x-forwarded-proto": "http", ...(token ? { cookie: `authjs.session-token=${token}` } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("API auth failures return JSON, never HTML redirects", async () => {
  for (const [email, status] of [[null, 401], ["other@example.com", 403]]) {
    const response = await GET(await request("/api/youtube/channel", undefined, email), {});
    assert.equal(response.status, status);
    assert.match(response.headers.get("content-type"), /json/);
    assert.equal(response.headers.get("location"), null);
    assert((await response.json()).error);
  }
});

test("metadata validation provides actionable issues before any Google call", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Must not contact Google"); });
  const response = await POST(await request("/api/youtube/init-upload", { metadata: { title: "", privacyStatus: "private" }, fileSize: 10 }), {});
  assert.equal(response.status, 400);
  assert((await response.json()).issues.some((issue) => issue.message === "Title is required."));
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("channel network failure is a structured 502", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("network down"); });
  const response = await GET(await request("/api/youtube/channel"), {});
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /YouTube/);
});

test("outcome lookup returns bounded candidates, never an auto-picked video", async (t) => {
  const base = Date.parse("2026-10-18T12:00:00Z");
  const at = (offset) => new Date(base + offset).toISOString();
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    if (String(url).includes("/channels")) {
      return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU-owner" } } }] });
    }
    return Response.json({
      items: [
        { snippet: { title: "Older release", publishedAt: at(-86_400_000), resourceId: { videoId: "old-video" } } },
        {
          snippet: {
            title: "Midnight  Loop",
            publishedAt: at(-90_000),
            resourceId: { videoId: "possibly-earlier-video" },
          },
        },
        {
          snippet: {
            title: "midnight loop",
            publishedAt: at(-30_000),
            resourceId: { videoId: "candidate-video" },
          },
        },
        {
          snippet: {
            title: "Midnight Loop",
            publishedAt: at(600_000),
            resourceId: { videoId: "after-window-video" },
          },
        },
      ],
    });
  });

  const response = await latestUpload(
    await request("/api/youtube/latest-upload", {
      title: "midnight loop",
      notBefore: at(-60_000),
      notAfter: at(0),
    }),
    {},
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.video, undefined, "recovery must not adopt a video automatically");
  assert.deepEqual(
    body.candidates.map((candidate) => candidate.videoId),
    ["candidate-video", "possibly-earlier-video"],
    "earlier same-title uploads are shown but a later one is outside the window",
  );
  assert.equal(urls.length, 2, urls.join("\n"));
  assert(urls[0].includes("part=contentDetails"));
  assert(urls[1].includes("playlistItems") && urls[1].includes("playlistId=UU-owner"));
  assert(!urls.some((url) => url.includes("search")));
});

test("outcome lookup refuses to guess and guards its input", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("/channels")) {
      return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU-owner" } } }] });
    }
    return Response.json({
      items: [
        { snippet: { title: "Something else", publishedAt: new Date().toISOString(), resourceId: { videoId: "other-video" } } },
        { snippet: { title: "Midnight", publishedAt: "2020-01-01T00:00:00Z", resourceId: { videoId: "ancient-video" } } },
      ],
    });
  });

  const now = new Date().toISOString();
  const miss = await latestUpload(
    await request("/api/youtube/latest-upload", {
      title: "Midnight",
      notBefore: new Date(Date.now() - 60_000).toISOString(),
      notAfter: now,
    }),
    {},
  );
  assert.equal(miss.status, 404);
  assert.match((await miss.json()).error, /matches that title/);

  for (const body of [
    { title: "Midnight", notBefore: "yesterday", notAfter: now },
    { title: "Midnight", notBefore: now },
    {
      title: "Midnight",
      notBefore: new Date(Date.now() + 60_000).toISOString(),
      notAfter: now,
    },
  ]) {
    const invalid = await latestUpload(await request("/api/youtube/latest-upload", body), {});
    assert.equal(invalid.status, 400, JSON.stringify(body));
  }

  const unauthorized = await latestUpload(
    await request(
      "/api/youtube/latest-upload",
      { title: "Midnight", notBefore: now, notAfter: now },
      "other@example.com",
    ),
    {},
  );
  assert.equal(unauthorized.status, 403);
});

test("upload initialization forwards immediate visibility and rejects a public schedule", async (t) => {
  let sent;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/session" } });
  });
  const response = await POST(
    await request("/api/youtube/init-upload", {
      metadata: { title: "Public track", privacyStatus: "public" },
      fileSize: 108389,
    }),
    {},
  );
  assert.equal(response.status, 200);
  assert.equal(sent.status.privacyStatus, "public");
  assert.equal(sent.status.publishAt, undefined);

  const fetchMock = globalThis.fetch.mock;
  const scheduled = await POST(
    await request("/api/youtube/init-upload", {
      metadata: {
        title: "Scheduled track",
        privacyStatus: "public",
        publishAt: "2028-01-01T10:00:00Z",
      },
      fileSize: 108389,
    }),
    {},
  );
  assert.equal(scheduled.status, 400);
  assert.equal(fetchMock.callCount(), 1, "invalid privacy must reject before contacting Google");
});

test("video status lookup reads actual privacy, publish time and processing state", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    return Response.json({
      items: [
        {
          id: "dQw4w9WgXcQ",
          status: {
            privacyStatus: "public",
            uploadStatus: "processed",
            publishAt: "2026-10-18T12:00:00Z",
          },
          processingDetails: { processingStatus: "succeeded" },
        },
      ],
    });
  });

  const response = await videoStatus(
    await request("/api/youtube/video-status", { videoIds: ["dQw4w9WgXcQ"] }),
    {},
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.videos, [
    {
      videoId: "dQw4w9WgXcQ",
      privacyStatus: "public",
      uploadStatus: "processed",
      publishAt: "2026-10-18T12:00:00Z",
      failureReason: null,
      processingStatus: "succeeded",
    },
  ]);
  assert(urls[0].includes("part=status,processingDetails"));
  assert(urls[0].includes("id=dQw4w9WgXcQ"));

  const invalid = await videoStatus(
    await request("/api/youtube/video-status", { videoIds: ["short"] }),
    {},
  );
  assert.equal(invalid.status, 400);
  const unauthorized = await videoStatus(
    await request("/api/youtube/video-status", { videoIds: ["dQw4w9WgXcQ"] }, "other@example.com"),
    {},
  );
  assert.equal(unauthorized.status, 403);
});

test("upload initialization sends only metadata/size and persists auth cookies", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert(init.headers instanceof Headers);
    assert.equal(init.headers.get("Authorization"), "Bearer fake");
    assert.equal(init.headers.get("X-Upload-Content-Length"), "108389");
    assert.equal(JSON.parse(init.body).snippet.title, "Test");
    return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/session" } });
  });
  const response = await POST(await request("/api/youtube/init-upload", { metadata: { title: "Test", privacyStatus: "unlisted" }, fileSize: 108389 }), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sessionUri, "https://www.googleapis.com/upload/session");
  assert(response.headers.getSetCookie().some((cookie) => cookie.startsWith("authjs.session-token=")));
});
