import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";

import authConfig from "@/auth.config";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Refresh 60s before the access token actually expires. */
const EXPIRY_SLACK_SECONDS = 60;

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return { ...token, error: "MissingRefreshToken" };
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
      cache: "no-store",
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
      refreshToken: payload.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
      // The refresh token deliberately never reaches the session object.
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (token.email) {
        session.user.email = token.email;
      }
      return session;
    },
  },
});
