/**
 * BeatFlow is a single-user tool. Every route and page must verify that the
 * signed-in Google account is the owner before doing anything.
 */

/** The owner's email, normalized, or null when misconfigured. */
export function ownerEmail(): string | null {
  const value = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Fails closed: when `OWNER_EMAIL` is missing nothing is authorized.
 */
export function isOwner(email: string | null | undefined): boolean {
  const owner = ownerEmail();
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}
