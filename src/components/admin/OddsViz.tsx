"use client";

import { useEffect, useRef } from "react";
import type { SimResult } from "@/lib/tournament-sim";

const PHASES = ["Skupina", "Čtvrtfinále", "Semifinále", "Finále", "Vítěz"];
const PLACE_BUCKETS = [
  "Vítěz",
  "Finále",
  "Semifinále",
  "Čtvrtfinále",
  "Skupina",
];
const PLACE_COLORS = ["#ffb020", "#3fb6ff", "#a78bfa", "#4ade80", "#475569"];
const LINE_COLORS = ["#ffb020", "#3fb6ff", "#a78bfa"];

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

function heatColor(t: number) {
  const stops = [
    [14, 28, 43],
    [35, 90, 140],
    [63, 182, 255],
    [255, 176, 32],
  ];
  const seg = Math.min(2.999, t * 3);
  const i = Math.floor(seg);
  const f = seg - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const c = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
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

  const winRef = useCanvas((ctx, w, h) => {
    const rows = ids
      .map((id) => ({ name: names[id]!, prob: sim.winProb[id] ?? 0 }))
      .sort((a, b) => b.prob - a.prob);
    const left = 70;
    const right = 78;
    const top = 6;
    const rowH = (h - top - 8) / Math.max(rows.length, 1);
    const max = Math.max(...rows.map((r) => r.prob), 0.01);
    ctx.font = "11px ui-sans-serif";
    ctx.textBaseline = "middle";
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const bw = (w - left - right) * (r.prob / max);
      ctx.fillStyle = "#8aa0b4";
      ctx.textAlign = "right";
      ctx.fillText(r.name, left - 8, y + rowH / 2);
      const grad = ctx.createLinearGradient(left, 0, left + bw, 0);
      grad.addColorStop(0, "#ffb020");
      grad.addColorStop(1, "#ff7a59");
      ctx.fillStyle = grad;
      const bh = Math.max(6, rowH - 7);
      roundRect(ctx, left, y + (rowH - bh) / 2, Math.max(2, bw), bh, 4);
      ctx.fill();
      ctx.fillStyle = "#e8eef5";
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
    const pad = { l: 44, r: 12, t: 10, b: 22 };
    let maxY = 0;
    sim.convergence.forEach((s) => s.series.forEach((v) => (maxY = Math.max(maxY, v))));
    maxY = Math.max(maxY, 0.05) * 1.15;
    ctx.strokeStyle = "#22303f";
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = "#8aa0b4";
    ctx.font = "10px ui-sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const yv = (maxY * g) / 4;
      const y = h - pad.b - (h - pad.t - pad.b) * (g / 4);
      ctx.fillText(`${(yv * 100).toFixed(0)}%`, pad.l - 6, y);
      ctx.strokeStyle = "#16202b";
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
    }
    sim.convergence.forEach((s, idx) => {
      ctx.strokeStyle = LINE_COLORS[idx % LINE_COLORS.length]!;
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
    const rows = ids
      .map((id) => ({ name: names[id]!, vals: sim.reachProb[id] ?? [] }))
      .sort((a, b) => (b.vals[4] ?? 0) - (a.vals[4] ?? 0));
    const left = 70;
    const top = 22;
    const right = 8;
    const bottom = 6;
    const cw = (w - left - right) / PHASES.length;
    const rh = (h - top - bottom) / Math.max(rows.length, 1);
    ctx.font = "10px ui-sans-serif";
    ctx.textBaseline = "middle";
    PHASES.forEach((ph, c) => {
      ctx.fillStyle = "#8aa0b4";
      ctx.textAlign = "center";
      ctx.fillText(ph, left + cw * c + cw / 2, 12);
    });
    rows.forEach((r, i) => {
      const y = top + i * rh;
      ctx.fillStyle = "#8aa0b4";
      ctx.textAlign = "right";
      ctx.fillText(r.name, left - 8, y + rh / 2);
      r.vals.forEach((v, c) => {
        const x = left + cw * c;
        ctx.fillStyle = heatColor(v);
        roundRect(ctx, x + 1.5, y + 1.5, cw - 3, rh - 3, 3);
        ctx.fill();
        if (v >= 0.06) {
          ctx.fillStyle = v > 0.5 ? "#1a1205" : "#cfe2f2";
          ctx.textAlign = "center";
          ctx.fillText(`${(v * 100).toFixed(0)}`, x + cw / 2, y + rh / 2);
        }
      });
    });
  });

  const placeRef = useCanvas((ctx, w, h) => {
    const rows = ids
      .map((id) => ({ name: names[id]!, vals: sim.placeDist[id] ?? [] }))
      .sort((a, b) => (b.vals[0] ?? 0) - (a.vals[0] ?? 0) || (b.vals[1] ?? 0) - (a.vals[1] ?? 0));
    const left = 70;
    const right = 8;
    const top = 6;
    const bottom = 6;
    const rowH = (h - top - bottom) / Math.max(rows.length, 1);
    ctx.font = "11px ui-sans-serif";
    ctx.textBaseline = "middle";
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      let x = left;
      const bw = w - left - right;
      const bh = Math.max(7, rowH - 7);
      ctx.fillStyle = "#8aa0b4";
      ctx.textAlign = "right";
      ctx.fillText(r.name, left - 8, y + rowH / 2);
      r.vals.forEach((v, b) => {
        const seg = bw * v;
        if (seg <= 0) return;
        ctx.fillStyle = PLACE_COLORS[b]!;
        ctx.fillRect(x, y + (rowH - bh) / 2, seg, bh);
        x += seg;
      });
    });
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Šance na vítězství → kurz" hint="Pravděpodobnost a férový kurz.">
        <canvas ref={winRef} height={430} className="w-full" />
      </Card>
      <Card title="Konvergence odhadu" hint="Ustálení šance TOP favoritů s počtem běhů.">
        <canvas ref={convRef} height={430} className="w-full" />
        <Legend
          items={sim.convergence.map((s, i) => ({
            color: LINE_COLORS[i % LINE_COLORS.length]!,
            label: s.name,
          }))}
        />
      </Card>
      <Card title="Šance dojít do fáze" hint="Pravděpodobnost dosažení dané fáze.">
        <canvas ref={heatRef} height={430} className="w-full" />
      </Card>
      <Card title="Rozdělení umístění" hint="Kde hráč nejčastěji skončí.">
        <canvas ref={placeRef} height={430} className="w-full" />
        <Legend
          items={PLACE_BUCKETS.map((b, i) => ({ color: PLACE_COLORS[i]!, label: b }))}
        />
      </Card>
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <p className="mb-3 text-xs text-slate-500">{hint}</p>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
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
