import { describe, it, expect } from "vitest";
import { formatBugReport } from "@/lib/bug-report";

describe("formatBugReport", () => {
  it("includes message, user, page and time", () => {
    const out = formatBugReport({
      message: "Tlačítko nejde",
      user: "honza",
      pageUrl: "/sazeni",
      at: new Date("2026-06-15T17:00:00Z"),
    });
    expect(out).toContain("Tlačítko nejde");
    expect(out).toContain("honza");
    expect(out).toContain("/sazeni");
    expect(out).toContain("2026");
  });

  it("truncates overly long messages", () => {
    const out = formatBugReport({
      message: "x".repeat(5000),
      user: "u",
      pageUrl: "/",
      at: new Date(),
    });
    expect(out.length).toBeLessThanOrEqual(2000);
  });
});
