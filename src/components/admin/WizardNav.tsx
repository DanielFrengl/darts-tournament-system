import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type NavLink = { href: string; label: string };

export function WizardNav({
  back,
  next,
  className = "",
}: {
  back?: NavLink;
  next?: NavLink;
  className?: string;
}) {
  if (!back && !next) return null;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 ${className}`}
    >
      <div>
        {back && (
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link href={back.href}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {back.label}
              </Link>
            }
          />
        )}
      </div>
      <div>
        {next && (
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href={next.href}>
                {next.label}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
