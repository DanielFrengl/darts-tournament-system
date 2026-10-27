/**
 * When betting on a leg shuts.
 *
 * Nobody operates the book during a match, so the window can't depend on an
 * admin pressing anything — and it can't depend on a background job either,
 * because nothing is running to fire one. Instead the deadline is written
 * onto the leg's market when the leg starts, and every read and write
 * compares it against the clock. No cron, no worker: a market whose moment
 * has passed is closed by arithmetic, even if the app sat idle for an hour.
 *
 * Pure and dependency-free so the betting pages, the admin screens and the
 * services can all share one rule.
 */

export const LEG_BETTING_WINDOW_SECONDS = 30;

/** The instant betting on a leg started at `startedAt` stops. */
export function legBettingDeadline(startedAt: Date): Date {
  return new Date(startedAt.getTime() + LEG_BETTING_WINDOW_SECONDS * 1000);
}

/**
 * Whether a market will still take a bet.
 *
 * `closesAt` in the past means shut regardless of `status`: the status column
 * only changes when something writes to it, and the whole point here is that
 * nothing does.
 */
export function isMarketBettable(
  market: { status: string; closesAt: Date | null },
  now: Date = new Date()
): boolean {
  if (market.status !== "open") return false;
  return market.closesAt === null || market.closesAt.getTime() > now.getTime();
}

/** Whole seconds left on the window, floored at 0. Null when there's no deadline. */
export function secondsUntilClose(
  closesAt: Date | null,
  now: Date = new Date()
): number | null {
  if (closesAt === null) return null;
  return Math.max(0, Math.ceil((closesAt.getTime() - now.getTime()) / 1000));
}
