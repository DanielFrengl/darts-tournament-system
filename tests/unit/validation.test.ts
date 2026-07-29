import { describe, it, expect } from "vitest";
import {
  RegisterSchema,
  LoginSchema,
  ProfileUpdateSchema,
  CapitalAdjustSchema,
  StakeSchema,
  isWholeStake,
} from "@/lib/validation";

describe("RegisterSchema", () => {
  it("accepts valid input", () => {
    const r = RegisterSchema.safeParse({
      email: "test@example.com",
      firstName: "Karel",
      lastName: "Novák",
      password: "hunter2hunter",
    });
    expect(r.success).toBe(true);
  });

  it("rejects bad email", () => {
    const r = RegisterSchema.safeParse({
      email: "no-at",
      firstName: "Karel",
      lastName: "Novák",
      password: "longenough",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing name", () => {
    const r = RegisterSchema.safeParse({
      email: "a@b.cz",
      firstName: "",
      lastName: "Novák",
      password: "longenough",
    });
    expect(r.success).toBe(false);
  });

  it("rejects name with digits", () => {
    const r = RegisterSchema.safeParse({
      email: "a@b.cz",
      firstName: "Karel99",
      lastName: "Novák",
      password: "longenough",
    });
    expect(r.success).toBe(false);
  });

  it("rejects short password", () => {
    const r = RegisterSchema.safeParse({
      email: "a@b.cz",
      firstName: "Karel",
      lastName: "Novák",
      password: "short",
    });
    expect(r.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid", () => {
    expect(LoginSchema.safeParse({ email: "a@b.cz", password: "anything" }).success).toBe(true);
  });
  it("rejects missing fields", () => {
    expect(LoginSchema.safeParse({ email: "a@b.cz" }).success).toBe(false);
  });
});

describe("ProfileUpdateSchema", () => {
  it("accepts bio update", () => {
    expect(ProfileUpdateSchema.safeParse({ bio: "Hello" }).success).toBe(true);
  });
  it("accepts password change with current + new", () => {
    const r = ProfileUpdateSchema.safeParse({
      currentPassword: "old1234567",
      newPassword: "new1234567",
    });
    expect(r.success).toBe(true);
  });
  it("rejects new password without current", () => {
    const r = ProfileUpdateSchema.safeParse({ newPassword: "new1234567" });
    expect(r.success).toBe(false);
  });
  it("rejects bio over 500 chars", () => {
    expect(ProfileUpdateSchema.safeParse({ bio: "x".repeat(501) }).success).toBe(false);
  });
});

describe("CapitalAdjustSchema", () => {
  it("accepts positive amount with note", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: 100, note: "bonus" }).success).toBe(true);
  });
  it("accepts negative amount with note", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: -50, note: "fine" }).success).toBe(true);
  });
  it("rejects zero", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: 0, note: "x" }).success).toBe(false);
  });
  it("rejects missing note", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: 100 }).success).toBe(false);
  });
});

describe("StakeSchema / isWholeStake", () => {
  it("accepts whole positive stakes", () => {
    expect(StakeSchema.safeParse(1).success).toBe(true);
    expect(StakeSchema.safeParse(250).success).toBe(true);
    expect(isWholeStake(1)).toBe(true);
    expect(isWholeStake(250)).toBe(true);
  });

  it("rejects decimals", () => {
    expect(StakeSchema.safeParse(1.5).success).toBe(false);
    expect(StakeSchema.safeParse(0.01).success).toBe(false);
    expect(isWholeStake(1.5)).toBe(false);
    expect(isWholeStake(99.99)).toBe(false);
  });

  it("rejects zero, negatives and non-finite values", () => {
    expect(isWholeStake(0)).toBe(false);
    expect(isWholeStake(-5)).toBe(false);
    expect(isWholeStake(Number.NaN)).toBe(false);
    expect(isWholeStake(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
