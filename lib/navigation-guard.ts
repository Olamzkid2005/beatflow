/**
 * Internal navigation guard. `beforeunload` does not fire for Next.js client
 * links, so active work registers a reason here and the app-shell click
 * listener asks before allowing the route change.
 */

type Guard = () => string | null;

const guards = new Set<Guard>();

export function registerNavigationGuard(guard: Guard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

/** First active reason, or null when navigation is free. */
export function navigationBlockReason(): string | null {
  for (const guard of guards) {
    const reason = guard();
    if (reason) return reason;
  }
  return null;
}

/** Pure enough for tests: the caller supplies the confirmation UI. */
export function canNavigate(confirm: (message: string) => boolean): boolean {
  const reason = navigationBlockReason();
  return reason === null || confirm(reason);
}

/** Test helper; not used by the application. */
export function resetNavigationGuards(): void {
  guards.clear();
}
