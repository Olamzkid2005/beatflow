import NextAuth from "next-auth";

import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Next 16 proxy runs in Node. This intentionally uses only optimistic identity
 * checks: route wrappers refresh credentials and independently enforce ownership.
 */
export const proxy = auth;

export const config = {
  matcher: ["/generate/:path*", "/api/youtube/:path*"],
};
