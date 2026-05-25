"use client";

import { useEffect, useState } from "react";
import { useLive } from "@/lib/use-live";
import { useRouter } from "next/navigation";
import { DARTS_FACTS } from "@/lib/darts-facts";
import type { MatchListItem } from "@/components/tournament/MatchListCard";

export function TvDisplay({
  tournamentId,
  tournamentName,
  startedAt,
  matches,
  initialFactIndex,
}: {
  tournamentId: string;
  tournamentName: string;
  startedAt: string | null;
  matches: MatchListItem[];
  initialFactIndex: number;
}) {
  const router = useRouter();
  useLive([`tournament:${tournamentId}`], () => router.refresh());
  // Also refresh once a minute even if nothing changed — keeps the
  // clock accurate even if no live events arrive.
  useEffect(() => {
    const i = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(i);
  }, [router]);

  const elapsed = useElapsed(startedAt);
  const factIndex = useRotatingIndex(initialFactIndex, DARTS_FACTS.length, 12_000);
  const fact = DARTS_FACTS[factIndex];

  const live = matches.filter((m) => m.status === "live");
  const next = matches.filter((m) => m.status === "scheduled").slice(0, 3);

  return (
    <div className="flex min-h-screen flex-col bg-black p-8 text-white">
      <header className="flex items-baseline justify-between border-b border-white/20 pb-4">
        <div>
          <h1 className="text-5xl font-bold tracking-tight">{tournamentName}</h1>
          <p className="mt-1 text-sm uppercase tracking-widest text-white/60">
            Lokální turnaj
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-white/60">Probíhá</p>
          <p className="font-mono text-5xl font-bold tabular-nums">{elapsed}</p>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-3 gap-6 py-6">
        <section className="col-span-2 space-y-4">
          {live.length > 0 ? (
            <>
              <h2 className="text-xl font-semibold text-red-400">🔴 Živě</h2>
              <div className="space-y-3">
                {live.map((m) => (
                  <BigMatchCard key={m.id} match={m} />
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-12">
              <p className="text-2xl text-white/60">Žádný zápas zrovna neběží</p>
              {next[0] && (
                <p className="text-sm text-white/40">
                  Další: #{next[0].number} · {next[0].playerA} vs {next[0].playerB}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Na řadě</h2>
          <div className="space-y-2">
            {next.length === 0 ? (
              <p className="text-sm text-white/40">— nic dalšího —</p>
            ) : (
              next.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>#{m.number}</span>
                    <span>{m.phaseLabel} · bo{m.bestOf}</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {m.playerA}{" "}
                    <span className="text-white/40">vs</span> {m.playerB}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-widest text-white/40">Věděli jste, že…</p>
        <p key={fact} className="mt-2 animate-in fade-in text-2xl font-light leading-snug">
          {fact}
        </p>
      </footer>
    </div>
  );
}

function BigMatchCard({ match }: { match: MatchListItem }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/60">
        <span>#{match.number} · {match.phaseLabel}</span>
        <span>best of {match.bestOf}</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <p
          className={`truncate text-right text-3xl ${match.winnerSide === "A" ? "font-bold" : ""}`}
        >
          {match.playerA}
        </p>
        <p className="font-mono text-6xl font-bold tabular-nums">
          {match.scoreA}{" "}
          <span className="text-white/40">:</span> {match.scoreB}
        </p>
        <p
          className={`truncate text-left text-3xl ${match.winnerSide === "B" ? "font-bold" : ""}`}
        >
          {match.playerB}
        </p>
      </div>
    </div>
  );
}

function useElapsed(startedAt: string | null): string {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (!startedAt) return "—";
  const ms = now - new Date(startedAt).getTime();
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function useRotatingIndex(initial: number, length: number, intervalMs: number): number {
  const [idx, setIdx] = useState(initial);
  useEffect(() => {
    const i = setInterval(() => setIdx((x) => (x + 1) % length), intervalMs);
    return () => clearInterval(i);
  }, [length, intervalMs]);
  return idx;
}
