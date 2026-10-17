import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireOwner } from "@/lib/require-owner";
import { authedFetch, readGoogleError, YOUTUBE_API_BASE } from "@/lib/youtube/api";

export const runtime = "nodejs";

type ChannelsListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      thumbnails?: { default?: { url?: string } };
    };
    statistics?: {
      subscriberCount?: string;
      videoCount?: string;
    };
  }>;
};

export const GET = auth(async (request) => {
  const owner = await requireOwner(request.auth);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  try {
    const response = await authedFetch(
      `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&mine=true`,
      owner.accessToken,
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: await readGoogleError(response) },
        { status: response.status },
      );
    }

    const body = (await response.json()) as ChannelsListResponse;
    const channel = body.items?.[0];
    if (!channel?.id) {
      return NextResponse.json(
        { error: "This Google account has no YouTube channel." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: channel.id,
      title: channel.snippet?.title ?? null,
      avatar: channel.snippet?.thumbnails?.default?.url ?? null,
      subscriberCount: channel.statistics?.subscriberCount ?? null,
      videoCount: channel.statistics?.videoCount ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach YouTube or read its response. Try again." },
      { status: 502 },
    );
  }
});
