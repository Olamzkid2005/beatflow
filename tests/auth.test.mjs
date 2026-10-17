import assert from "node:assert/strict";
import { test } from "node:test";
import { encode, decode } from "next-auth/jwt";
import { NextRequest } from "next/server";

process.env.AUTH_SECRET = "test-only-secret-not-a-real-credential-000000000";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.OWNER_EMAIL = "owner@example.com";
const { auth, handlers } = await import("../auth.ts");
const { requireOwner } = await import("../lib/require-owner.ts");

async function request(path, token) {
  const cookie = await encode({
    secret: process.env.AUTH_SECRET,
    salt: "authjs.session-token",
    token: { email: "owner@example.com", accessToken: "fake-old", refreshToken: "fake-refresh", expiresAt: Math.floor(Date.now() / 1000) + 3600, ...token },
  });
  return new NextRequest(`http://localhost${path}`, { headers: { cookie: `authjs.session-token=${cookie}`, host: "localhost", "x-forwarded-proto": "http" } });
}

test("public session endpoint never serializes Google credentials", async () => {
  const response = await handlers.GET(await request("/api/auth/session"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.email, "owner@example.com");
  assert.equal(body.accessToken, undefined);
  assert.equal(body.refreshToken, undefined);
  assert.equal(body.user.refreshToken, undefined);
});

test("refresh failure returns an actionable 401 instead of authorizing the stale token", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
  const route = auth(async (req) => Response.json(await requireOwner(req.auth)));
  const response = await route(await request("/api/youtube/channel", { expiresAt: 0 }), {});
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.status, 401);
  assert.match(body.error, /Sign in again/);
});

test("server auth refreshes and persists rotated credentials on the route response", async (t) => {
  let refreshes = 0;
  t.mock.method(globalThis, "fetch", async () => { refreshes += 1; return Response.json({ access_token: "fake-fresh", expires_in: 3600, refresh_token: "fake-rotated" }); });
  const route = auth(async (req) => {
    const owner = await requireOwner(req.auth);
    assert.equal(owner.ok, true);
    assert.equal(owner.accessToken, "fake-fresh");
    return Response.json({ ok: true });
  });
  const response = await route(await request("/api/youtube/channel", { expiresAt: 0 }), {});
  const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("authjs.session-token="));
  assert(setCookie, "Refreshed JWT must be persisted");
  const cookie = setCookie.split(";")[0].slice("authjs.session-token=".length);
  const jwt = await decode({ token: cookie, secret: process.env.AUTH_SECRET, salt: "authjs.session-token" });
  assert.equal(jwt.accessToken, "fake-fresh");
  assert.equal(jwt.refreshToken, "fake-rotated");
  await route(new NextRequest("http://localhost/api/youtube/channel", { headers: { cookie: `authjs.session-token=${cookie}`, host: "localhost", "x-forwarded-proto": "http" } }), {});
  assert.equal(refreshes, 1, "A subsequent request must reuse the persisted access token");
});

test("route guard independently rejects missing identity, nonowner, and refresh errors", async () => {
  assert.equal((await requireOwner(null)).status, 401);
  assert.equal((await requireOwner({ user: { email: "other@example.com" }, expires: "", accessToken: "fake" })).status, 403);
  assert.equal((await requireOwner({ user: { email: "owner@example.com" }, expires: "", accessToken: "stale", error: "RefreshAccessTokenError" })).status, 401);
  const owner = process.env.OWNER_EMAIL;
  try {
    delete process.env.OWNER_EMAIL;
    assert.equal((await requireOwner({ user: { email: "owner@example.com" }, expires: "", accessToken: "fake" })).status, 403);
  } finally {
    process.env.OWNER_EMAIL = owner;
  }
});
