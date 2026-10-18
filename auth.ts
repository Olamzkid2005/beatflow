import NextAuth, { type NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

import authConfig from "@/auth.config";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Refresh 60s before the access token actually expires. */
const EXPIRY_SLACK_SECONDS = 60;

/**
 * One in-flight refresh per refresh token. Without this, two concurrent expired
 * requests each call Google; if the first rotates the refresh token, the second
 * can reject and overwrite the successful cookie with a stale failure.
 *
 * This coordinates one server process only. Separate serverless instances still
 * need provider-side behavior or shared state, which is deliberately not added.
 */
const inFlightRefreshes = new Map<string, Promise<JWT>>();

export function refreshInFlightCount(): number {
  return inFlightRefreshes.size;
}

async function requestRefresh(token: JWT, refreshToken: string): Promise<JWT> {
  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error ?? `Token refresh failed (${response.status})`);
    }

    return {
      ...token,
      accessToken: payload.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (payload.expires_in ?? 3600),
      // Google only returns a new refresh token when it rotates one.
      refreshToken: payload.refresh_token ?? refreshToken,
      error: undefined,
    };
  } catch {
    // A failed request must never keep a stale access token or credentials that
    // another concurrent refresh may already have rotated.
    return { ...token, accessToken: undefined, error: "RefreshAccessTokenError" };
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const refreshToken = token.refreshToken;
  if (!refreshToken) {
    return { ...token, accessToken: undefined, error: "MissingRefreshToken" };
  }

  const existing = inFlightRefreshes.get(refreshToken);
  if (existing) {
    const shared = await existing;
    // Keep this request's session fields while sharing the refreshed tokens.
    return { ...token, ...shared, email: shared.email ?? token.email };
  }

  const pending = requestRefresh(token, refreshToken);
  inFlightRefreshes.set(refreshToken, pending);
  try {
    return await pending;
  } finally {
    if (inFlightRefreshes.get(refreshToken) === pending) {
      inFlightRefreshes.delete(refreshToken);
    }
  }
}

const config = {
  ...authConfig,
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // Initial sign-in: capture the tokens Google just handed us.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.error = undefined;
      }

      if (profile?.email) {
        token.email = profile.email;
      }

      const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0;
      const stillValid = Date.now() < (expiresAt - EXPIRY_SLACK_SECONDS) * 1000;
      if (token.accessToken && stillValid) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      // This callback is also used by GET /api/auth/session. No Google
      // credentials belong in that browser-readable representation.
      return {
        expires: session.expires,
        user: { name: session.user.name, email: token.email, image: session.user.image },
        error: token.error,
      };
    },
  },
} satisfies NextAuthConfig;

export const { handlers, signIn, signOut } = NextAuth(config);

// Only server imports use this instance. Route wrappers persist refreshed JWT
// cookies; its session projection never serves /api/auth/session.
export const { auth } = NextAuth({
  ...config,
  callbacks: {
    ...config.callbacks,
    async session(args) {
      return {
        ...await config.callbacks.session(args),
        accessToken: args.token.accessToken,
      };
    },
  },
});
