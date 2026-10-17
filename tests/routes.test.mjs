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

test("outcome lookup follows the uploads playlist and never uses search.list", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    if (String(url).includes("/channels")) {
      return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU-owner" } } }] });
    }
    return Response.json({
      items: [
        { snippet: { title: "Older release", publishedAt: "2026-10-01T10:00:00Z", resourceId: { videoId: "old-video" } } },
        {
          snippet: {
            title: "Midnight  Loop",
            publishedAt: new Date(Date.now() - 30_000).toISOString(),
            resourceId: { videoId: "recovered-video" },
          },
        },
      ],
    });
  });

  const response = await latestUpload(
    await request("/api/youtube/latest-upload", {
      title: "midnight loop",
      notBefore: new Date(Date.now() - 60_000).toISOString(),
    }),
    {},
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).video.videoId, "recovered-video");
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

  const miss = await latestUpload(
    await request("/api/youtube/latest-upload", {
      title: "Midnight",
      notBefore: new Date(Date.now() - 60_000).toISOString(),
    }),
    {},
  );
  assert.equal(miss.status, 404);
  assert.match((await miss.json()).error, /matches that title/);

  const invalid = await latestUpload(
    await request("/api/youtube/latest-upload", { title: "Midnight", notBefore: "yesterday" }),
    {},
  );
  assert.equal(invalid.status, 400);

  const unauthorized = await latestUpload(
    await request("/api/youtube/latest-upload", { title: "Midnight", notBefore: new Date().toISOString() }, "other@example.com"),
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
