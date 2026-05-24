import { describe, it, expect } from "vitest";
import {
  RegisterSchema,
  LoginSchema,
  ProfileUpdateSchema,
  CapitalAdjustSchema,
} from "@/lib/validation";

describe("RegisterSchema", () => {
  it("accepts valid input", () => {
    const r = RegisterSchema.safeParse({
      email: "test@example.com",
      username: "karel_99",
      password: "hunter2hunter",
    });
    expect(r.success).toBe(true);
  });

  it("rejects bad email", () => {
    const r = RegisterSchema.safeParse({
      email: "no-at",
      username: "karel",
      password: "longenough",
    });
    expect(r.success).toBe(false);
  });

  it("rejects short username", () => {
    const r = RegisterSchema.safeParse({
      email: "a@b.cz",
      username: "ab",
      password: "longenough",
    });
    expect(r.success).toBe(false);
  });

  it("rejects username with spaces", () => {
    const r = RegisterSchema.safeParse({
      email: "a@b.cz",
      username: "with space",
      password: "longenough",
    });
    expect(r.success).toBe(false);
  });

  it("rejects short password", () => {
    const r = RegisterSchema.safeParse({
      email: "a@b.cz",
      username: "karel",
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
