import "server-only";
import { EventEmitter } from "node:events";

export type LiveEvent = {
  channel: string;
  event: string;
  data?: unknown;
};

type GlobalWithBus = typeof globalThis & {
  __dartsEventBus?: EventEmitter;
};

/**
 * Module-level singleton. We attach to globalThis so Next.js hot reload
 * doesn't drop the listener list every time we edit a file.
 */
function getBus(): EventEmitter {
  const g = globalThis as GlobalWithBus;
  if (!g.__dartsEventBus) {
    g.__dartsEventBus = new EventEmitter();
    g.__dartsEventBus.setMaxListeners(0);
  }
  return g.__dartsEventBus;
}

/**
 * Publish to a channel. Anyone subscribed to `channel` receives the
 * full LiveEvent payload.
 *
 * In-process only: works when the app runs as a single Node process
 * (local dev, single-instance deployments). For multi-instance prod
 * deployments swap this implementation for Pusher/Ably/Redis pub-sub.
 */
export function publish(channel: string, event: string, data?: unknown): void {
  const payload: LiveEvent = { channel, event, data };
  getBus().emit(channel, payload);
}

/**
 * Subscribe to one or more channels. Returns an unsubscribe function.
 */
export function subscribe(
  channels: string[],
  listener: (payload: LiveEvent) => void
): () => void {
  const bus = getBus();
  for (const c of channels) bus.on(c, listener);
  return () => {
    for (const c of channels) bus.off(c, listener);
  };
}
