import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireOwner } from "@/lib/require-owner";
import { authedFetch, readGoogleError, YOUTUBE_API_BASE } from "@/lib/youtube/api";
import { parseChannelUploads, pickMatchingUpload } from "@/lib/youtube/reconcile";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Recovers the video ID when the browser could not read the resumable upload's
 * response. Uses the channel's uploads playlist: `channels.list` (1 unit) then
 * `playlistItems.list` (1 unit), which is far cheaper than `search.list`.
 */
const bodySchema = z.object({
  title: z.string().trim().min(1).max(100),
  notBefore: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), "notBefore must be an ISO 8601 timestamp."),
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

    const itemsResponse = await authedFetch(
      `${YOUTUBE_API_BASE}/playlistItems?part=snippet&maxResults=10&playlistId=${encodeURIComponent(uploadsPlaylist)}`,
      owner.accessToken,
    );
    if (!itemsResponse.ok) {
      return NextResponse.json(
        { error: await readGoogleError(itemsResponse) },
        { status: itemsResponse.status },
      );
    }

    const match = pickMatchingUpload(parseChannelUploads(await itemsResponse.json()), parsed.data);
    if (!match) {
      return NextResponse.json(
        {
          error:
            "No upload on this channel matches that title yet. YouTube may still be processing it — try again in a minute.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ video: match });
  } catch {
    return NextResponse.json(
      { error: "Could not reach YouTube or read its response. Try again." },
      { status: 502 },
    );
  }
});
