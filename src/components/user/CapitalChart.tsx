"use client";

import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatJablka } from "@/lib/jablka";

export type CapitalPoint = {
  /** Unix epoch milliseconds of the transaction. */
  t: number;
  /** Balance after the transaction. */
  balance: number;
};

// Matches the palette conventions in LeaderboardCharts.tsx.
const LINE = "#22d3ee"; // cyan-400
const AXIS = "#a1a1aa"; // zinc-400
const GRID = "rgba(255,255,255,0.08)";

const tooltipStyle = {
  backgroundColor: "#18181b",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e5e7eb",
} as const;

const dateFmt = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

export function CapitalChart({ points }: { points: CapitalPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        Zatím žádné transakce — graf se objeví po první sázce.
      </p>
    );
  }

  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ left: 12, right: 12, top: 8, bottom: 8 }}
        >
          <defs>
            <linearGradient id="capitalFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.25} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            stroke={AXIS}
            fontSize={12}
            tickLine={false}
            minTickGap={32}
            tickFormatter={(v: number) => dateFmt.format(new Date(v))}
          />
          <YAxis
            stroke={AXIS}
            fontSize={12}
            width={48}
            domain={["auto", "auto"]}
            tickFormatter={formatTick}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "#e5e7eb" }}
            itemStyle={{ color: "#e5e7eb" }}
            labelFormatter={(v) => dateTimeFmt.format(new Date(Number(v)))}
            formatter={(v) => [formatJablka(Number(v ?? 0)), "Zůstatek"]}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={LINE}
            strokeWidth={2}
            fill="url(#capitalFill)"
            dot={false}
            activeDot={{ r: 5, fill: LINE }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
