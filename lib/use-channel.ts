"use client";

import { useEffect, useState } from "react";

export type Channel = {
  id: string;
  title: string | null;
  avatar: string | null;
  subscriberCount: string | null;
  videoCount: string | null;
};

type ChannelState = {
  channel: Channel | null;
  error: string | null;
  loading: boolean;
};

export function useChannel(): ChannelState {
  const [state, setState] = useState<ChannelState>({
    channel: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/youtube/channel", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    })
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setState({
            channel: null,
            error: body.error ?? `Channel request failed (${response.status})`,
            loading: false,
          });
          return;
        }
        setState({ channel: body as Channel, error: null, loading: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            channel: null,
            error: "Could not reach the channel endpoint.",
            loading: false,
          });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return state;
}
