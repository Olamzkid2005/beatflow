import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Internal server auth instance only; omitted from public session responses. */
    accessToken?: string;
    /** Set when the refresh token could not be exchanged. */
    error?: string;
    user: {
      email?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    /** Server-side only. Never copied onto `Session`. */
    refreshToken?: string;
    /** Access-token expiry, in seconds since the epoch. */
    expiresAt?: number;
    error?: string;
  }
}
