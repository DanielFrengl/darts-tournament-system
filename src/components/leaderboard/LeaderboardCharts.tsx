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
  PieChart,
  Pie,
  LineChart,
  Line,
  Legend,
} from "recharts";

export type LeaderboardRow = {
  userId: string;
  username: string;
  displayName: string;
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

type ChartType = "bar" | "donut" | "line";
const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "bar", label: "Sloupcový" },
  { key: "donut", label: "Kruhový" },
  { key: "line", label: "Spojnice" },
];

// 8-color palette tuned for dark backgrounds with WCAG-AA contrast.
const PALETTE = [
  "#22d3ee", // cyan-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#60a5fa", // blue-400
  "#fb7185", // rose-400
  "#facc15", // yellow-400
];

const POSITIVE = "#34d399"; // emerald-400
const NEGATIVE = "#fb7185"; // rose-400
const AXIS = "#a1a1aa"; // zinc-400
const GRID = "rgba(255,255,255,0.08)";

const fmt = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 0,
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
  const [chartType, setChartType] = useState<ChartType>("bar");
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0]!;

  const data = rows
    .map((r) => ({ name: r.displayName, value: valueOf(r, metric.key) }))
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
      <div className="flex flex-wrap gap-2">
        {CHART_TYPES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChartType(c.key)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
              c.key === chartType
                ? "border-foreground/40 bg-secondary text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={data} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis
                dataKey="name"
                stroke={AXIS}
                fontSize={12}
                tickLine={false}
                interval={0}
                angle={data.length > 4 ? -20 : 0}
                textAnchor={data.length > 4 ? "end" : "middle"}
                height={data.length > 4 ? 56 : 30}
              />
              <YAxis
                stroke={AXIS}
                fontSize={12}
                width={48}
                tickFormatter={(v: number) => formatTick(v, metric.format)}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.06)" }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#e5e7eb" }}
                itemStyle={{ color: "#e5e7eb" }}
                formatter={(v) => formatValue(Number(v ?? 0), metric.format)}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.name}
                    fill={d.value >= 0 ? POSITIVE : NEGATIVE}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : chartType === "donut" ? (
            <PieChart>
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#e5e7eb" }}
                itemStyle={{ color: "#e5e7eb" }}
                formatter={(v) => formatValue(Number(v ?? 0), metric.format)}
              />
              <Legend
                wrapperStyle={{ color: "#e5e7eb", fontSize: 12 }}
                iconType="circle"
              />
              <Pie
                data={data.map((d) => ({
                  ...d,
                  // donut needs non-negative values
                  value: Math.max(0, d.value),
                }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="rgba(0,0,0,0.4)"
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <LineChart data={data} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis
                dataKey="name"
                stroke={AXIS}
                fontSize={12}
                tickLine={false}
                interval={0}
                angle={data.length > 4 ? -20 : 0}
                textAnchor={data.length > 4 ? "end" : "middle"}
                height={data.length > 4 ? 56 : 30}
              />
              <YAxis
                stroke={AXIS}
                fontSize={12}
                width={48}
                tickFormatter={(v: number) => formatTick(v, metric.format)}
              />
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#e5e7eb" }}
                itemStyle={{ color: "#e5e7eb" }}
                formatter={(v) => formatValue(Number(v ?? 0), metric.format)}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={PALETTE[0]}
                strokeWidth={2}
                dot={{ fill: PALETTE[0], r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#18181b",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e5e7eb",
} as const;

function formatTick(v: number, format: Metric["format"]): string {
  if (format === "percent") return `${v.toFixed(0)}%`;
  if (format === "count") return v.toString();
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function formatValue(v: number, format: Metric["format"]): string {
  if (format === "percent") return `${v.toFixed(1)} %`;
  if (format === "count") return v.toString();
  return `${fmt.format(v)} jablka`;
}
