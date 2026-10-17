"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  cn,
  StatusDot,
} from "@/components/ui/primitives";
import {
  clearHistory,
  historyStatus,
  readHistory,
  type UploadHistoryEntry,
} from "@/lib/history";

type Filter = "all" | "scheduled" | "published";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusTone(status: ReturnType<typeof historyStatus>) {
  return status === "scheduled" ? "tertiary" : status === "published" ? "success" : "neutral";
}

function statusDot(status: ReturnType<typeof historyStatus>) {
  return status === "scheduled" ? "tertiary" : status === "published" ? "primary" : "muted";
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<UploadHistoryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const refresh = () => setEntries(readHistory());
    refresh();
    window.addEventListener("beatflow:history", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("beatflow:history", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function handleClear() {
    if (!window.confirm("Clear all upload history from this browser?")) return;
    clearHistory();
    setEntries([]);
  }

  const filtered = (entries ?? []).filter((entry) => {
    if (filter === "all") return true;
    return historyStatus(entry) === filter;
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
            <span>Studio</span>
            <span aria-hidden>/</span>
            <span className="text-on-surface">History</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Release history
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-variant">
            A local record of uploads started from this browser. Nothing here is synced to
            another device.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            <StatusDot tone="muted" />
            {entries === null ? "Loading" : `${entries.length} upload${entries.length === 1 ? "" : "s"}`}
          </Badge>
          <Link href="/generate" className={buttonClass({ size: "sm" })}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            New upload
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex w-full max-w-sm rounded-xl border border-surface-container-highest bg-surface-container-low p-1 sm:w-auto"
          role="group"
          aria-label="Filter history"
        >
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              aria-pressed={filter === item.value}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-8 sm:flex-none",
                filter === item.value
                  ? "bg-surface-container-high text-primary"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {entries && entries.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            <Icon name="trash" className="h-3.5 w-3.5" />
            Clear history
          </Button>
        ) : null}
      </div>

      {entries === null ? (
        <div className="flex flex-col gap-3" aria-label="Loading upload history" role="status">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl border border-surface-container-highest bg-surface-container-low/60"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-high text-primary">
            <Icon name={entries.length === 0 ? "history" : "search"} className="h-6 w-6" />
          </span>
          <div>
            <p className="text-base font-medium">
              {entries.length === 0 ? "No uploads recorded yet" : "Nothing matches this filter"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-on-surface-variant">
              {entries.length === 0
                ? "Start an upload from the studio and it will appear here with its video id and release state."
                : "Try another release state or switch back to all uploads."}
            </p>
          </div>
          {entries.length === 0 ? (
            <Link href="/generate" className={buttonClass({ size: "md" })}>
              Open the studio
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          ) : (
            <Button type="button" variant="outline" size="md" onClick={() => setFilter("all")}>
              Show all uploads
            </Button>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((entry) => {
            const status = historyStatus(entry);
            return (
              <Card key={entry.videoId} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline-variant/70 bg-surface-container-lowest text-primary">
                      <Icon
                        name={status === "published" ? "youtube" : status === "scheduled" ? "calendar" : "movie"}
                        className="h-4 w-4"
                      />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-medium">{entry.title}</h2>
                        <Badge tone={statusTone(status)}>
                          <StatusDot tone={statusDot(status)} />
                          {status === "scheduled" ? "Scheduled" : status === "published" ? "Published" : "Unlisted"}
                        </Badge>
                      </div>

                      <p className="mt-1 truncate font-mono text-[10px] text-outline">
                        {entry.videoId} · {entry.channelTitle ?? "Unknown channel"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="calendar" className="h-3.5 w-3.5 text-outline" />
                          {entry.publishAt ? formatDate(entry.publishAt) : "No schedule"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="shield" className="h-3.5 w-3.5 text-outline" />
                          {entry.privacyStatus}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="clock" className="h-3.5 w-3.5 text-outline" />
                          Added {formatDate(entry.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:pl-4">
                    <a
                      href={`https://studio.youtube.com/video/${entry.videoId}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass({ variant: "outline", size: "sm" })}
                    >
                      YouTube Studio
                      <Icon name="external" className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-2 border-t border-surface-container-highest pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-outline">
        <Icon name="info" className="h-3.5 w-3.5" />
        Stored in this browser · Up to 50 entries
      </p>
    </div>
  );
}
