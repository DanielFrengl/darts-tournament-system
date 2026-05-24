import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PROTECTED = ["/", "/dashboard", "/settings", "/bets", "/leaderboard", "/tournament", "/u/"];
const ADMIN_ONLY = ["/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|register).*)"],
  runtime: "nodejs",
};
