import { describe, it, expect } from "vitest";
import {
  LEG_BETTING_WINDOW_SECONDS,
  legBettingDeadline,
  isMarketBettable,
  secondsUntilClose,
} from "@/lib/betting-window";

const at = (iso: string) => new Date(iso);

describe("legBettingDeadline", () => {
  it("is the leg start plus the window", () => {
    const start = at("2026-10-27T20:00:00.000Z");
    expect(legBettingDeadline(start).toISOString()).toBe(
      "2026-10-27T20:00:30.000Z"
    );
    expect(LEG_BETTING_WINDOW_SECONDS).toBe(30);
  });
});

describe("isMarketBettable", () => {
  const now = at("2026-10-27T20:00:10.000Z");

  it("takes a bet inside the window", () => {
    expect(
      isMarketBettable({ status: "open", closesAt: at("2026-10-27T20:00:30Z") }, now)
    ).toBe(true);
  });

  it("refuses once the window has run out, even though the row still says open", () => {
    // This is the whole point: nothing writes to the status column when the
    // window lapses, so the deadline has to be what decides.
    expect(
      isMarketBettable({ status: "open", closesAt: at("2026-10-27T20:00:05Z") }, now)
    ).toBe(false);
  });

  it("refuses exactly on the deadline", () => {
    expect(
      isMarketBettable({ status: "open", closesAt: now }, now)
    ).toBe(false);
  });

  it("takes a bet when there is no deadline at all", () => {
    // Match-winner and futures books have no window; they close by status.
    expect(isMarketBettable({ status: "open", closesAt: null }, now)).toBe(true);
  });

  it("refuses any status other than open, deadline or not", () => {
    for (const status of ["closed", "settled", "cancelled"]) {
      expect(isMarketBettable({ status, closesAt: null }, now)).toBe(false);
      expect(
        isMarketBettable({ status, closesAt: at("2026-10-27T23:00:00Z") }, now)
      ).toBe(false);
    }
  });
});

describe("secondsUntilClose", () => {
  const now = at("2026-10-27T20:00:00.000Z");

  it("rounds up to the whole second, so the figure shown never reads 0 early", () => {
    expect(secondsUntilClose(at("2026-10-27T20:00:29.100Z"), now)).toBe(30);
    expect(secondsUntilClose(at("2026-10-27T20:00:00.400Z"), now)).toBe(1);
  });

  it("floors at zero instead of going negative", () => {
    expect(secondsUntilClose(at("2026-10-27T19:59:00Z"), now)).toBe(0);
  });

  it("has nothing to count without a deadline", () => {
    expect(secondsUntilClose(null, now)).toBeNull();
  });
});
