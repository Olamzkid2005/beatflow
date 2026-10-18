"use client";

import { useEffect } from "react";

import { canNavigate } from "@/lib/navigation-guard";

/**
 * Capture-phase internal link guard. It runs before Next's Link handler, so a
 * declined confirmation prevents the route change instead of cancelling work
 * after unmount. Hash links and external links are left alone.
 */
export function NavigationGuard() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.hash && url.pathname === window.location.pathname) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      if (!canNavigate((message) => window.confirm(message))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
