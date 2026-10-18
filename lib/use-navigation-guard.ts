"use client";

import { useEffect } from "react";

import { registerNavigationGuard } from "./navigation-guard";

export function useNavigationGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;
    return registerNavigationGuard(() => message);
  }, [active, message]);
}
