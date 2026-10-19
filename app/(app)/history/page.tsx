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
  addHistoryEntry,
  clearHistory,
  historyStatus,
  historyStorageWarning,
  readHistory,
  type UploadHistoryEntry,
} from "@/lib/history";

type Filter = "all" | "scheduled" | "published" | "publish-time-passed" | "failed";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "publish-time-passed", label: "Publish time passed" },
  { value: "failed", label: "Issues" },
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
  if (status === "scheduled") return "tertiary";
  if (status === "published") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function statusDot(status: ReturnType<typeof historyStatus>) {
  if (status === "scheduled") return "tertiary";
  if (status === "published") return "success";
  if (status === "failed") return "danger";
  return "muted";
}

function statusLabel(status: ReturnType<typeof historyStatus>) {
  if (status === "scheduled") return "Scheduled";
  if (status === "published") return "Published";
  if (status === "publish-time-passed") return "Publish time passed";
  if (status === "failed") return "Upload issue";
  if (status === "unknown") return "Check in Studio";
  if (status === "private") return "Private";
  return "Unlisted";
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<UploadHistoryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [clearError, setClearError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      readHistory()
        .then((next) => {
          if (active) {
            setEntries(next);
            setSyncError(historyStorageWarning());
          }
        })
        .catch(() => {
          if (active) setEntries([]);
        });
    };
    refresh();
    window.addEventListener("beatflow:history", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener("beatflow:history", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  async function handleRefresh() {
    if (!entries?.length || syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch("/api/youtube/video-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ videoIds: entries.map((entry) => entry.videoId) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.videos)) {
        throw new Error(body?.error ?? `Could not read statuses (${response.status}).`);
      }
      const byId = new Map<string, Record<string, unknown>>(
        body.videos.map((video: Record<string, unknown>) => [String(video.videoId), video]),
      );
      const checkedAt = new Date().toISOString();
      const next = entries.map((entry) => {
        const status = byId.get(entry.videoId);
        if (!status) return entry;
        return {
          ...entry,
          privacyStatus: String(status.privacyStatus),
          publishAt: typeof status.publishAt === "string" ? status.publishAt : null,
          uploadStatus: typeof status.uploadStatus === "string" ? status.uploadStatus : null,
          processingStatus:
            typeof status.processingStatus === "string" ? status.processingStatus : null,
          failureReason:
            typeof status.failureReason === "string" ? status.failureReason : null,
          checkedAt,
        };
      });
      setEntries(next);
      let durable = true;
      for (const entry of next) {
        if (!byId.has(entry.videoId)) continue;
        durable = (await addHistoryEntry(entry)) && durable;
      }
      if (!durable) setSyncError("Statuses refreshed, but this browser could not save them locally.");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not refresh video statuses.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleClear() {
    if (!window.confirm("Clear all upload history from this browser?")) return;
    setClearError(null);
    try {
      await clearHistory();
      setEntries([]);
    } catch {
      // Do not show an empty list when the delete did not commit.
      setClearError("This browser could not clear history. Nothing was deleted.");
    }
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
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="outline" size="sm" disabled={syncing} onClick={handleRefresh}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              {syncing ? "Checking YouTube…" : "Refresh from YouTube"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
              <Icon name="trash" className="h-3.5 w-3.5" />
              Clear history
            </Button>
          </div>
        ) : null}
      </div>

      {clearError ? (
        <p role="alert" className="rounded-xl border border-error/25 bg-error-container/10 p-3 text-sm text-error">
          {clearError}
        </p>
      ) : null}
      {syncError ? (
        <p role="alert" className="rounded-xl border border-error/25 bg-error-container/10 p-3 text-sm text-error">
          {syncError}
        </p>
      ) : null}

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
                        name={
                          status === "published"
                            ? "youtube"
                            : status === "failed"
                              ? "alert"
                              : status === "publish-time-passed"
                                ? "clock"
                            : status === "scheduled"
                              ? "calendar"
                              : status === "unknown"
                                ? "alert"
                                : "movie"
                        }
                        className="h-4 w-4"
                      />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-medium">{entry.title}</h2>
                        <Badge tone={statusTone(status)}>
                          <StatusDot tone={statusDot(status)} />
                          {statusLabel(status)}
                        </Badge>
                      </div>

                      <p className="mt-1 truncate font-mono text-[10px] text-outline">
                        {entry.videoId} · {entry.channelTitle ?? "Unknown channel"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="calendar" className="h-3.5 w-3.5 text-outline" />
                          {entry.publishAt
                            ? formatDate(entry.publishAt)
                            : status === "unknown"
                              ? "Schedule unverified"
                              : "No schedule"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="shield" className="h-3.5 w-3.5 text-outline" />
                          {entry.privacyStatus === "unknown" ? "Privacy unverified" : entry.privacyStatus}
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
        Stored in IndexedDB in this browser · Up to 50 entries · Refresh reads the actual status from YouTube
      </p>
    </div>
  );
}
