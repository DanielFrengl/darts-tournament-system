"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export type LeaderboardRow = {
  userId: string;
  username: string;
  capital: number;
  totalStaked: number;
  totalReturn: number;
  netProfit: number;
  roi: number | null;
  betCount: number;
  won: number;
  lost: number;
  refunded: number;
  open: number;
  winRate: number | null;
};

type Metric = {
  key: keyof LeaderboardRow;
  label: string;
  format: "currency" | "count" | "percent";
};

const METRICS: Metric[] = [
  { key: "netProfit", label: "Čistý zisk", format: "currency" },
  { key: "roi", label: "ROI %", format: "percent" },
  { key: "winRate", label: "Úspěšnost %", format: "percent" },
  { key: "totalStaked", label: "Obrat", format: "currency" },
  { key: "betCount", label: "Počet sázek", format: "count" },
  { key: "won", label: "Výhry", format: "count" },
  { key: "capital", label: "Kapitál", format: "currency" },
];

const fmt = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function valueOf(row: LeaderboardRow, key: Metric["key"]): number {
  const v = row[key];
  if (typeof v === "number") return v;
  if (v == null) return 0;
  return Number(v);
}

export function LeaderboardCharts({ rows }: { rows: LeaderboardRow[] }) {
  const [metricKey, setMetricKey] = useState<Metric["key"]>("netProfit");
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0]!;

  const data = rows
    .map((r) => ({ name: r.username, value: valueOf(r, metric.key) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetricKey(m.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
              m.key === metricKey
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              width={48}
              tickFormatter={(v: number) => formatTick(v, metric.format)}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--accent))", opacity: 0.2 }}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => formatValue(Number(v ?? 0), metric.format)}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((d) => (
                <Cell
                  key={d.name}
                  fill={
                    d.value >= 0
                      ? "var(--color-primary, oklch(0.69 0.16 165))"
                      : "var(--color-destructive, oklch(0.7 0.18 25))"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatTick(v: number, format: Metric["format"]): string {
  if (format === "percent") return `${v.toFixed(0)}%`;
  if (format === "count") return v.toString();
  // currency — short form
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function formatValue(v: number, format: Metric["format"]): string {
  if (format === "percent") return `${v.toFixed(1)} %`;
  if (format === "count") return v.toString();
  return fmt.format(v);
}
