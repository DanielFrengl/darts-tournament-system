import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/roles";

// Routes that don't require a session.
const PUBLIC_EXACT = new Set(["/login", "/register"]);
const PUBLIC_PREFIXES = ["/api/", "/_next/", "/display"];

const ADMIN_ONLY_PREFIX = "/admin";

function redirectTo(req: Parameters<Parameters<typeof auth>[0]>[0], pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (isPublic(pathname)) return NextResponse.next();

  if (pathname.startsWith(ADMIN_ONLY_PREFIX)) {
    if (!session?.user) return redirectTo(req, "/login");
    if (!isAdmin(session.user.role)) return redirectTo(req, "/");
    return NextResponse.next();
  }

  // Everything else requires a session.
  if (!session?.user) return redirectTo(req, "/login");
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
