"use client";

import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function EloChart({
  rows,
}: {
  rows: { name: string; elo: number }[];
}) {
  if (rows.length === 0) return null;

  const min = Math.min(...rows.map((r) => r.elo));
  const max = Math.max(...rows.map((r) => r.elo));
  const height = Math.max(180, rows.length * 34 + 16);

  return (
    <div className="rounded-xl border p-4" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 4, right: 44, top: 4, bottom: 4 }}
        >
          <XAxis type="number" domain={[min - 20, max + 20]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in oklab, var(--muted) 60%, transparent)" }}
            contentStyle={{
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="elo"
            fill="var(--primary)"
            radius={[0, 4, 4, 0]}
            barSize={18}
          >
            <LabelList
              dataKey="elo"
              position="right"
              fill="var(--foreground)"
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
