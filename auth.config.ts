import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { isOwner } from "@/lib/owner";

/** Shared Google provider and optimistic owner gate. Token refresh stays in auth.ts. */
const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // `youtube.upload` to publish, `youtube.readonly` to read the channel.
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube.readonly",
          ].join(" "),
          // Required to receive a refresh token from Google.
          access_type: "offline",
          // Force the consent screen so a refresh token is issued every time.
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    /** Reject every Google account that is not the owner. */
    signIn({ profile }) {
      return isOwner(profile?.email);
    },
    /** Pages redirect to sign-in; API clients always get machine-readable errors. */
    authorized({ auth, request }) {
      if (isOwner(auth?.user?.email)) return true;
      if (request.nextUrl.pathname.startsWith("/api/youtube/")) {
        return Response.json(
          { error: auth?.user ? "This tool is restricted to its owner." : "Not signed in. Sign in again." },
          { status: auth?.user ? 403 : 401 },
        );
      }
      return false;
    },
  },
};

export default authConfig;
