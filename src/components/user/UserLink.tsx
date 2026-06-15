import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders a user's name/username as a link to their profile (`/u/[username]`).
 * When no username is available (e.g. an offline darts player without an
 * account) it falls back to plain text, so it never produces a broken link.
 * Works in both server and client components.
 */
export function UserLink({
  username,
  className,
  children,
}: {
  username?: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!username) return <>{children}</>;
  return (
    <Link
      href={`/u/${username}`}
      className={cn(
        "rounded-sm underline-offset-2 hover:underline hover:text-foreground focus-visible:underline focus-visible:outline-none",
        className
      )}
    >
      {children}
    </Link>
  );
}
