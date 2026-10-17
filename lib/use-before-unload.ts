"use client";

import { useEffect } from "react";

/**
 * Asks the browser to confirm before the tab is closed or reloaded while
 * `active` is true (spec section 5: a running render or upload must not be lost
 * silently). The dialog text is the browser's own; `preventDefault` is what
 * actually triggers it in modern Chrome.
 */
export function useBeforeUnloadWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
