"use client";

import { useEffect } from "react";

import {
  canNavigate,
  isNavigationBlocked,
  subscribeNavigationGuards,
} from "@/lib/navigation-guard";

const TRAP_KEY = "__beatflowBlocked";

function isTrap(state: unknown): boolean {
  return Boolean(
    state &&
      typeof state === "object" &&
      (state as Record<string, unknown>)[TRAP_KEY] === true,
  );
}

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
      // Saving a file is not navigation, even while a job is active.
      if (anchor.hasAttribute("download")) return;

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

  // App Router has no supported back-navigation hook, so an active job pushes a
  // same-URL entry. Back then lands on an identical entry, which lets us ask
  // before the router reaches a different route. Declining steps forward again;
  // accepting steps past the duplicate so one back press still leaves.
  useEffect(() => {
    let trapped = false;

    const arm = () => {
      if (trapped || !isNavigationBlocked()) return;
      window.history.pushState(
        { ...(window.history.state ?? {}), [TRAP_KEY]: true },
        "",
        window.location.href,
      );
      trapped = true;
    };

    const onPopState = () => {
      if (!trapped) {
        if (isNavigationBlocked() && isTrap(window.history.state)) trapped = true;
        return;
      }
      trapped = false;
      if (!isNavigationBlocked()) return;
      if (canNavigate((message) => window.confirm(message))) {
        window.history.back();
        return;
      }
      window.history.forward();
    };

    // Once work ends, step off the duplicate so one back press still reaches
    // the previous page. Reconcile in a microtask: guard cleanups and setups
    // run in the same commit, and acting between them used to look like "work
    // finished" and send the owner back a page mid-navigation.
    const disarm = () => {
      if (!trapped || isNavigationBlocked()) return;
      trapped = false;
      if (isTrap(window.history.state)) window.history.back();
    };
    let scheduled = false;
    const reconcile = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        disarm();
        arm();
      });
    };

    window.addEventListener("popstate", onPopState);
    const unsubscribe = subscribeNavigationGuards(reconcile);
    reconcile();
    return () => {
      window.removeEventListener("popstate", onPopState);
      unsubscribe();
    };
  }, []);

  return null;
}
