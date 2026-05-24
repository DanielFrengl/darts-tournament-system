"use client";

import { useEffect, useRef } from "react";

export type LiveEvent = {
  channel: string;
  event: string;
  data?: unknown;
};

/**
 * Subscribe to one or more SSE channels and run a callback when any
 * event arrives. The callback is stored in a ref so closures over
 * fresh state (e.g. router from useRouter) stay current without
 * tearing down the EventSource on every render.
 */
export function useLive(channels: string[], onEvent: (e: LiveEvent) => void): void {
  const cbRef = useRef(onEvent);
  useEffect(() => {
    cbRef.current = onEvent;
  }, [onEvent]);
  const channelsKey = channels.slice().sort().join(",");
  useEffect(() => {
    if (channelsKey.length === 0) return;
    const url = `/api/events?channels=${encodeURIComponent(channelsKey)}`;
    const es = new EventSource(url);
    es.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data) as LiveEvent;
        cbRef.current(payload);
      } catch {
        // ignore malformed payloads
      }
    };
    return () => es.close();
  }, [channelsKey]);
}
