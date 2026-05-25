import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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

function redirectTo(req: Parameters<Parameters<typeof auth>[0]>[0], pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

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
    // Skip Next internals, public display route, and any request whose
    // path looks like a static asset (has a file extension).
    "/((?!api|_next/static|_next/image|favicon.ico|display|.*\\.[a-zA-Z0-9]+$).*)",
  ],
  runtime: "nodejs",
};
