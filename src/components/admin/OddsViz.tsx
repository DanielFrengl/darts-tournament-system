"use client";

import { useEffect, useRef, useState } from "react";
import type { SimResult, SimStage } from "@/lib/tournament-sim";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The simulation reports the stages this tournament actually has — a
// four-player playoff has no quarterfinal — so the columns are labelled from
// its answer instead of a fixed five.
const STAGE_LABEL: Record<SimStage, string> = {
  group: "Skupina",
  quarter: "Čtvrtfinále",
  semi: "Semifinále",
  final: "Finále",
  champion: "Vítěz",
};

/**
 * Colors resolved from the app's theme tokens so the charts match the rest of
 * the UI and adapt to light/dark. Read through a probe element (returns rgb),
 * which avoids relying on canvas `oklch()` support.
 */
type Theme = {
  foreground: string;
  muted: string;
  border: string;
  primary: string;
  primaryFg: string;
  series: string[]; // --chart-1..5, a light→dark neutral ramp
};

function readTheme(): Theme {
  const probe = document.createElement("span");
  probe.style.cssText = "display:none";
  document.body.appendChild(probe);
  const get = (v: string) => {
    probe.style.color = `var(${v})`;
    return getComputedStyle(probe).color || "rgb(136,136,136)";
  };
  const theme: Theme = {
    foreground: get("--foreground"),
    muted: get("--muted-foreground"),
    border: get("--border"),
    primary: get("--primary"),
    primaryFg: get("--primary-foreground"),
    series: [
      get("--chart-1"),
      get("--chart-2"),
      get("--chart-3"),
      get("--chart-4"),
      get("--chart-5"),
    ],
  };
  document.body.removeChild(probe);
  return theme;
}

function useThemeColors(): Theme | null {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const update = () => setTheme(readTheme());
    update();
    // Re-read when next-themes toggles the class on <html>.
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => obs.disconnect();
  }, []);
  return theme;
}

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = Number(cv.getAttribute("height"));
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
  });
  return ref;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function OddsViz({
  sim,
  names,
  houseEdge,
}: {
  sim: SimResult;
  names: Record<string, string>;
  houseEdge: number;
}) {
  const ids = Object.keys(names);
  const stages = sim.stages ?? ["group", "quarter", "semi", "final", "champion"];
  const phaseLabels = stages.map((s) => STAGE_LABEL[s] ?? s);
  // Placement buckets are the reach stages read from the other end: champion
  // first, knocked out in the groups last.
  const placeLabels = [...phaseLabels].reverse();
  const theme = useThemeColors();
  // Distinct line colors for the convergence chart: emphasis on the top
  // favorite (foreground) plus two mid-tone neutrals from the chart ramp.
  const lineColors = theme
    ? [theme.foreground, theme.series[1]!, theme.series[3]!]
    : [];

  const winRef = useCanvas((ctx, w, h) => {
    if (!theme) return;
    const rows = ids
      .map((id) => ({ name: names[id]!, prob: sim.winProb[id] ?? 0 }))
      .sort((a, b) => b.prob - a.prob);
    const left = 70;
    const right = 78;
    const top = 6;
    const rowH = (h - top - 8) / Math.max(rows.length, 1);
    const max = Math.max(...rows.map((r) => r.prob), 0.01);
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const bw = (w - left - right) * (r.prob / max);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = "right";
      ctx.fillText(r.name, left - 8, y + rowH / 2);
      ctx.fillStyle = theme.primary;
      const bh = Math.max(6, rowH - 7);
      roundRect(ctx, left, y + (rowH - bh) / 2, Math.max(2, bw), bh, 4);
      ctx.fill();
      ctx.fillStyle = theme.foreground;
      ctx.textAlign = "left";
      const odds = r.prob > 0 ? (1 / (r.prob * (1 - houseEdge))).toFixed(2) : "—";
      ctx.fillText(
        `${(r.prob * 100).toFixed(1)}%  ·  ${odds}×`,
        left + bw + 8,
        y + rowH / 2
      );
    });
  });

  const convRef = useCanvas((ctx, w, h) => {
    if (!theme) return;
    const pad = { l: 44, r: 12, t: 10, b: 22 };
    let maxY = 0;
    sim.convergence.forEach((s) => s.series.forEach((v) => (maxY = Math.max(maxY, v))));
    maxY = Math.max(maxY, 0.05) * 1.15;
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const yv = (maxY * g) / 4;
      const y = h - pad.b - (h - pad.t - pad.b) * (g / 4);
      ctx.fillText(`${(yv * 100).toFixed(0)}%`, pad.l - 6, y);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = theme.border;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.restore();
    }
    sim.convergence.forEach((s, idx) => {
      ctx.strokeStyle = lineColors[idx % lineColors.length]!;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.series.forEach((v, k) => {
        const x = pad.l + ((w - pad.l - pad.r) * k) / Math.max(s.series.length - 1, 1);
        const y = h - pad.b - (h - pad.t - pad.b) * (v / maxY);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
  });

  const heatRef = useCanvas((ctx, w, h) => {
    if (!theme) return;
    const rows = ids
      .map((id) => ({ name: names[id]!, vals: sim.reachProb[id] ?? [] }))
      // Champion is the last stage, whatever the bracket's depth.
      .sort((a, b) => (b.vals[b.vals.length - 1] ?? 0) - (a.vals[a.vals.length - 1] ?? 0));
    const left = 70;
    const top = 22;
    const right = 8;
    const bottom = 6;
    const cw = (w - left - right) / Math.max(phaseLabels.length, 1);
    const rh = (h - top - bottom) / Math.max(rows.length, 1);
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";
    phaseLabels.forEach((ph, c) => {
      ctx.fillStyle = theme.muted;
      ctx.textAlign = "center";
      ctx.fillText(ph, left + cw * c + cw / 2, 12);
    });
    rows.forEach((r, i) => {
      const y = top + i * rh;
      ctx.fillStyle = theme.muted;
      ctx.textAlign = "right";
      ctx.fillText(r.name, left - 8, y + rh / 2);
      r.vals.forEach((v, c) => {
        const x = left + cw * c;
        // Single-hue intensity: faint→solid primary by probability.
        ctx.save();
        ctx.globalAlpha = 0.08 + 0.92 * Math.min(1, Math.max(0, v));
        ctx.fillStyle = theme.primary;
        roundRect(ctx, x + 1.5, y + 1.5, cw - 3, rh - 3, 3);
        ctx.fill();
        ctx.restore();
        if (v >= 0.06) {
          ctx.fillStyle = v > 0.6 ? theme.primaryFg : theme.foreground;
          ctx.textAlign = "center";
          ctx.fillText(`${(v * 100).toFixed(0)}`, x + cw / 2, y + rh / 2);
        }
      });
    });
  });

  const placeRef = useCanvas((ctx, w, h) => {
    if (!theme) return;
    const rows = ids
      .map((id) => ({ name: names[id]!, vals: sim.placeDist[id] ?? [] }))
      .sort((a, b) => (b.vals[0] ?? 0) - (a.vals[0] ?? 0) || (b.vals[1] ?? 0) - (a.vals[1] ?? 0));
    const left = 70;
    const right = 8;
    const top = 6;
    const bottom = 6;
    const rowH = (h - top - bottom) / Math.max(rows.length, 1);
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      let x = left;
      const bw = w - left - right;
      const bh = Math.max(7, rowH - 7);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = "right";
      ctx.fillText(r.name, left - 8, y + rowH / 2);
      r.vals.forEach((v, b) => {
        const seg = bw * v;
        if (seg <= 0) return;
        ctx.fillStyle = theme.series[b] ?? theme.muted;
        ctx.fillRect(x, y + (rowH - bh) / 2, seg, bh);
        x += seg;
      });
    });
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Šance na vítězství → kurz" hint="Pravděpodobnost a férový kurz.">
        <canvas ref={winRef} height={430} className="w-full" />
      </ChartCard>
      <ChartCard title="Konvergence odhadu" hint="Ustálení šance TOP favoritů s počtem běhů.">
        <canvas ref={convRef} height={430} className="w-full" />
        <Legend
          items={sim.convergence.map((s, i) => ({
            color: lineColors[i % Math.max(lineColors.length, 1)] ?? "currentColor",
            label: s.name,
          }))}
        />
      </ChartCard>
      <ChartCard title="Šance dojít do fáze" hint="Pravděpodobnost dosažení dané fáze.">
        <canvas ref={heatRef} height={430} className="w-full" />
      </ChartCard>
      <ChartCard title="Rozdělení umístění" hint="Kde hráč nejčastěji skončí.">
        <canvas ref={placeRef} height={430} className="w-full" />
        <Legend
          items={placeLabels.map((b, i) => ({
            color: theme?.series[i] ?? "currentColor",
            label: b,
          }))}
        />
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{hint}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
