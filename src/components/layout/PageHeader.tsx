import type { ReactNode } from "react";

/**
 * Consistent page title block. `actions` sits inline on the right (wraps
 * below on narrow screens); `description` is optional supporting copy.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra content (badges, meta) rendered next to the title. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {children}
        </div>
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
