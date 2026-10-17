import type { Session } from "next-auth";
import { isOwner } from "@/lib/owner";

export type OwnerAuthResult =
  | { ok: true; email: string; accessToken: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Every route handler must call this first. A route that skips it would let any
 * visitor upload to the owner's channel.
 */
export async function requireOwner(session: Session | null): Promise<OwnerAuthResult> {
  if (!session?.user) {
    return { ok: false, status: 401, error: "Not signed in." };
  }

  if (!isOwner(session.user.email)) {
    return { ok: false, status: 403, error: "This tool is restricted to its owner." };
  }

  if (session.error || !session.accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Google access unavailable or expired. Sign in again.",
    };
  }

  return { ok: true, email: session.user.email!, accessToken: session.accessToken };
}
