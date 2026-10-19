import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireOwner } from "@/lib/require-owner";
import { authedFetch, readGoogleError, YOUTUBE_API_BASE } from "@/lib/youtube/api";
import { findMatchingUploads, parseChannelUploads } from "@/lib/youtube/reconcile";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Suggests possible uploads when the browser could not read the resumable
 * session's response. Uses the channel's uploads playlist: `channels.list`
 * (1 unit) then `playlistItems.list` (1 unit), far cheaper than `search.list`.
 * It never returns a single "matched" video: the owner must confirm an ID.
 */
const isoDate = (field: string) =>
  z.string().refine((value) => Number.isFinite(Date.parse(value)), `${field} must be an ISO 8601 timestamp.`);

const bodySchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    notBefore: isoDate("notBefore"),
    notAfter: isoDate("notAfter"),
  })
  .refine((value) => Date.parse(value.notAfter) >= Date.parse(value.notBefore), {
    message: "notAfter must be at or after notBefore.",
    path: ["notAfter"],
  });

type ChannelsPayload = {
  items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
};

export const POST = auth(async (request) => {
  const owner = await requireOwner(request.auth);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lookup request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const channelResponse = await authedFetch(
      `${YOUTUBE_API_BASE}/channels?part=contentDetails&mine=true`,
      owner.accessToken,
    );
    if (!channelResponse.ok) {
      return NextResponse.json(
        { error: await readGoogleError(channelResponse) },
        { status: channelResponse.status },
      );
    }

    const channel = ((await channelResponse.json()) as ChannelsPayload).items?.[0];
    const uploadsPlaylist = channel?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylist) {
      return NextResponse.json(
        { error: "This Google account has no YouTube uploads playlist." },
        { status: 404 },
      );
    }

    const uploads: ReturnType<typeof parseChannelUploads> = [];
    let pageToken: string | undefined;
    const deadline = Date.now() + 20_000;
    for (let page = 0; page < 10; page += 1) {
      const itemsResponse = await authedFetch(
        `${YOUTUBE_API_BASE}/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(uploadsPlaylist)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
        owner.accessToken,
        { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) },
      );
      if (!itemsResponse.ok) return NextResponse.json({ error: await readGoogleError(itemsResponse) }, { status: itemsResponse.status });
      const payload: unknown = await itemsResponse.json();
      uploads.push(...parseChannelUploads(payload));
      const next = (payload as { nextPageToken?: unknown } | null)?.nextPageToken;
      pageToken = typeof next === "string" && next ? next : undefined;
      if (!pageToken || Date.now() >= deadline) break;
    }
    const candidates = findMatchingUploads(uploads, parsed.data);
    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error:
            "No upload in the latest 500 channel uploads matches that title yet. YouTube may still be processing it; retry or inspect YouTube Studio before creating another upload.",
        },
        { status: 404 },
      );
    }

    // Candidates are suggestions, not proof of authorship. The UI requires an
    // explicit choice before writing a video ID or release metadata.
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json(
      { error: "Could not reach YouTube or read its response. Try again." },
      { status: 502 },
    );
  }
});
