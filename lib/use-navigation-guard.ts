"use client";

import { useEffect, useRef } from "react";

import { registerNavigationGuard } from "./navigation-guard";

export function useNavigationGuard(active: boolean, message: string): void {
  // Re-registering for every message change would delete the guard and notify
  // listeners first, which briefly looks like "work finished" and makes the
  // history trap step back while still on the protected page.
  const latest = useRef(message);
  useEffect(() => {
    latest.current = message;
  }, [message]);

  useEffect(() => {
    if (!active) return;
    return registerNavigationGuard(() => latest.current);
  }, [active]);
}
