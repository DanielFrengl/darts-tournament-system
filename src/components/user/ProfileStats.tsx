import type { UserStats } from "@/lib/user-stats";

const fmt = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function ProfileStats({
  stats,
  title,
  subtitle,
}: {
  stats: UserStats;
  title: string;
  subtitle?: string;
}) {
  const hasData = stats.betCount > 0;
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </header>
      {!hasData ? (
        <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
          Žádné sázky.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            label="Čistý zisk"
            value={`${stats.netProfit > 0 ? "+" : ""}${fmt.format(stats.netProfit)}`}
            suffix="jablka"
            tone={
              stats.netProfit > 0
                ? "positive"
                : stats.netProfit < 0
                  ? "negative"
                  : "neutral"
            }
          />
          <Stat
            label="ROI"
            value={stats.roi != null ? `${stats.roi.toFixed(1)}%` : "—"}
            tone={
              stats.roi == null
                ? "neutral"
                : stats.roi > 0
                  ? "positive"
                  : stats.roi < 0
                    ? "negative"
                    : "neutral"
            }
          />
          <Stat
            label="Úspěšnost"
            value={stats.winRate != null ? `${stats.winRate.toFixed(0)}%` : "—"}
            sub={`${stats.won} V · ${stats.lost} P`}
          />
          <Stat label="Sázek" value={String(stats.betCount)} sub={`${stats.open} otevř.`} />
          <Stat label="Obrat" value={fmt.format(stats.totalStaked)} suffix="jablka" />
          <Stat label="Návrat" value={fmt.format(stats.totalReturn)} suffix="jablka" />
          <Stat label="Výhry" value={String(stats.won)} tone="positive" />
          <Stat label="Prohry" value={String(stats.lost)} tone="negative" />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  suffix,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  suffix?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
        {suffix && (
          <span className="ml-1 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
