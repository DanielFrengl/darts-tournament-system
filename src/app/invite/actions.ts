"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { INVITE_COOKIE, verifyInviteCode } from "@/lib/settings";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function submitInvite(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "/login");
  if (!code) {
    redirect(`/invite?error=missing&redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  const ok = await verifyInviteCode(code);
  if (!ok) {
    redirect(`/invite?error=invalid&redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  const jar = await cookies();
  jar.set(INVITE_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/login";
  redirect(safeRedirect);
}
