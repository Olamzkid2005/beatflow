"use client";

import { useState } from "react";

import {
  loadStarterBackground,
  STARTER_BACKGROUNDS,
  type StarterBackground,
} from "@/lib/starter-backgrounds";

import { cn } from "./primitives";

/**
 * One-click bundled backgrounds for templates that need a photo. The buttons
 * carry the image as a CSS thumbnail, so no extra <img> element or remote
 * request is involved; the chosen file follows the same path as one picked
 * from disk.
 */
export function StarterBackgrounds({
  onSelect,
  disabled,
  className,
  "aria-describedby": describedBy,
}: {
  onSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(starter: StarterBackground) {
    if (disabled || busyId) return;
    setBusyId(starter.id);
    setError(null);
    try {
      onSelect(await loadStarterBackground(starter));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That background could not be loaded.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <fieldset
      className={cn("flex flex-col gap-2", className)}
      aria-describedby={describedBy}
      disabled={disabled}
    >
      <legend className="text-xs font-medium text-on-surface-variant">Or use a starter background</legend>
      <p className="text-[11px] leading-4 text-outline">
        Bundled originals — no upload and no web search. They work with every template.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {STARTER_BACKGROUNDS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            disabled={disabled || busyId !== null}
            onClick={() => void choose(starter)}
            aria-label={`Use ${starter.name} as the background image`}
            title={starter.description}
            className="group relative aspect-video overflow-hidden rounded-lg border border-outline-variant/70 bg-surface-container-lowest outline-none transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundImage: `url(${starter.src})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <span className="absolute inset-x-0 bottom-0 bg-black/80 px-1.5 py-1 text-left text-[11px] font-medium text-white">
              {busyId === starter.id ? "Loading…" : starter.name}
            </span>
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-xs leading-5 text-error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
