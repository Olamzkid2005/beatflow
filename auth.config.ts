import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { isOwner } from "@/lib/owner";

/**
 * Edge-safe Auth.js configuration.
 *
 * This file must not import anything that only works in the Node.js runtime,
 * because `middleware.ts` loads it on the Edge runtime. Token refresh lives in
 * `auth.ts` instead.
 */
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
    /** Used by the middleware wrapper: false redirects to the sign-in page. */
    authorized({ auth }) {
      return isOwner(auth?.user?.email);
    },
  },
};

export default authConfig;
