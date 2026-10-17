import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { requireOwner } from "@/lib/require-owner";
import { authedFetch, readGoogleError, YOUTUBE_UPLOAD_BASE } from "@/lib/youtube/api";
import { buildVideoResource, videoMetadataSchema } from "@/lib/youtube/metadata";

export const runtime = "nodejs";
// The MP4 never passes through here; only metadata and the file size do.
export const maxDuration = 30;

const initUploadSchema = z.object({
  metadata: videoMetadataSchema,
  /** Size of the MP4 in bytes, used for `X-Upload-Content-Length`. */
  fileSize: z.number().int().positive(),
});

export const POST = auth(async (request) => {
  const owner = await requireOwner(request.auth);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const payload = await request.json().catch(() => null);
  const parsed = initUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { metadata, fileSize } = parsed.data;
  try {
    const response = await authedFetch(
      `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
      owner.accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(fileSize),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(buildVideoResource(metadata)),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: await readGoogleError(response) },
        { status: response.status },
      );
    }

    const sessionUri = response.headers.get("Location");
    if (!sessionUri) {
      return NextResponse.json(
        { error: "YouTube did not return a resumable session URI." },
        { status: 502 },
      );
    }

    return NextResponse.json({ sessionUri });
  } catch {
    return NextResponse.json(
      { error: "Could not initialize the YouTube upload. Try again." },
      { status: 502 },
    );
  }
});
