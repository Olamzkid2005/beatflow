import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireOwner } from "@/lib/require-owner";
import { authedFetch, readGoogleError, YOUTUBE_API_BASE } from "@/lib/youtube/api";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  videoIds: z
    .array(z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Invalid video ID."))
    .min(1)
    .max(50),
});

type VideosPayload = {
  items?: Array<{
    id?: string;
    status?: {
      privacyStatus?: string;
      uploadStatus?: string;
      publishAt?: string;
      failureReason?: string;
    };
    processingDetails?: { processingStatus?: string };
  }>;
};

/**
 * Reads the actual release state of videos the owner already uploaded. The
 * history page uses this instead of inferring publication from a timestamp.
 */
export const POST = auth(async (request) => {
  const owner = await requireOwner(request.auth);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid status request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const ids = [...new Set(parsed.data.videoIds)].join(",");
    const response = await authedFetch(
      `${YOUTUBE_API_BASE}/videos?part=status,processingDetails&id=${encodeURIComponent(ids)}`,
      owner.accessToken,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: await readGoogleError(response) },
        { status: response.status },
      );
    }

    const items = ((await response.json()) as VideosPayload).items ?? [];
    const videos = items.flatMap((item) => {
      if (!item.id || !item.status?.privacyStatus) return [];
      return [{
        videoId: item.id,
        privacyStatus: item.status.privacyStatus,
        uploadStatus: item.status.uploadStatus ?? null,
        publishAt: item.status.publishAt ?? null,
        failureReason: item.status.failureReason ?? null,
        processingStatus: item.processingDetails?.processingStatus ?? null,
      }];
    });
    return NextResponse.json({ videos });
  } catch {
    return NextResponse.json(
      { error: "Could not read video status from YouTube. Try again." },
      { status: 502 },
    );
  }
});
