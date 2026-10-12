import NextAuth from "next-auth";

import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Next 16 replaced `middleware.ts` with `proxy.ts`. This loads `auth.config.ts`
 * only, so nothing Node.js-specific runs on the Edge runtime. The `authorized`
 * callback rejects any account that is not the owner.
 */
export const proxy = auth;

export const config = {
  matcher: ["/generate/:path*", "/api/youtube/:path*"],
};
