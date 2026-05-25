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

function redirectTo(req: Parameters<Parameters<typeof auth>[0]>[0], pathname: string, params?: Record<string, string>) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (NEEDS_INVITE_PREFIXES.some((p) => pathname.startsWith(p))) {
    const inviteOk = req.cookies.get(INVITE_COOKIE)?.value === "1";
    if (!inviteOk) {
      return redirectTo(req, "/invite", { redirectTo: pathname });
    }
  }

  if (ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    if (!session?.user) return redirectTo(req, "/login");
    if (session.user.role !== "admin") return redirectTo(req, "/");
  }

  if (PROTECTED.some((p) => pathname.startsWith(p))) {
    if (!session?.user) return redirectTo(req, "/login");
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next internals, public-facing display/invite routes, and any
    // request whose path looks like a static asset (has a file extension).
    "/((?!api|_next/static|_next/image|favicon.ico|display|invite|.*\\.[a-zA-Z0-9]+$).*)",
  ],
  runtime: "nodejs",
};
