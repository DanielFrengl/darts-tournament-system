import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { INVITE_COOKIE } from "@/lib/settings";

const PROTECTED = [
  "/",
  "/dashboard",
  "/settings",
  "/bets",
  "/leaderboard",
  "/tournament",
  "/u/",
];
const ADMIN_ONLY = ["/admin"];
const NEEDS_INVITE_PREFIXES = ["/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (NEEDS_INVITE_PREFIXES.some((p) => pathname.startsWith(p))) {
    const inviteOk = req.cookies.get(INVITE_COOKIE)?.value === "1";
    if (!inviteOk) {
      const url = new URL("/invite", req.url);
      url.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (session.user.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (PROTECTED.some((p) => pathname.startsWith(p))) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|display|invite).*)"],
  runtime: "nodejs",
};
