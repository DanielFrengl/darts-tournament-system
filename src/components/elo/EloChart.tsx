"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function EloChart({ rows }: { rows: { name: string; elo: number }[] }) {
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
          margin={{ left: 4, right: 40, top: 4, bottom: 4 }}
        >
          <XAxis type="number" domain={[min - 20, max + 20]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={72}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "currentColor" }}
            className="text-muted-foreground"
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.1)" }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="elo" radius={[0, 4, 4, 0]} barSize={18}>
            {rows.map((_, i) => (
              <Cell key={i} fill={i < 3 ? "#f59e0b" : "#64748b"} />
            ))}
            <LabelList
              dataKey="elo"
              position="right"
              className="fill-foreground"
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
