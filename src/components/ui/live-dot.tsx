import { cn } from "@/lib/utils";

/**
 * Pulsing red dot used as the visual "live" indicator. Renders an
 * outer ping ring plus a solid inner dot so the animation is visible
 * even on slow refresh rates.
 */
export function LiveDot({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: { box: "h-2 w-2", inner: "h-2 w-2" },
    md: { box: "h-2.5 w-2.5", inner: "h-2.5 w-2.5" },
    lg: { box: "h-3 w-3", inner: "h-3 w-3" },
  } as const;
  const s = sizes[size];
  return (
    <span
      className={cn("relative inline-flex shrink-0", s.box, className)}
      aria-hidden
    >
      <span
        className={cn(
          "absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75"
        )}
      />
      <span
        className={cn(
          "relative inline-flex rounded-full bg-red-500",
          s.inner
        )}
      />
    </span>
  );
}
