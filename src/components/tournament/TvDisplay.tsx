"use client";

import { useEffect, useState } from "react";
import { useLive } from "@/lib/use-live";
import { useRouter } from "next/navigation";
import { DARTS_FACTS } from "@/lib/darts-facts";
import type { MatchListItem } from "@/components/tournament/MatchListCard";
import { BracketView, type BracketMatchVM } from "@/components/tournament/BracketView";
import { LiveDot } from "@/components/ui/live-dot";

const poolFmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });

export function TvDisplay({
  tournamentId,
  tournamentName,
  systemName,
  logoUrl,
  startedAt,
  matches,
  bracket,
}: {
  tournamentId: string;
  tournamentName: string;
  systemName: string;
  logoUrl: string;
  startedAt: string | null;
  matches: MatchListItem[];
  bracket: BracketMatchVM[];
}) {
  const router = useRouter();
  useLive([`tournament:${tournamentId}`], () => router.refresh());
  useEffect(() => {
    const i = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(i);
  }, [router]);

  const elapsed = useElapsed(startedAt);
  const [initialFactIndex] = useState(() => Math.floor(Date.now() / 12_000));
  const factIndex = useRotatingIndex(initialFactIndex, DARTS_FACTS.length, 12_000);
  const fact = DARTS_FACTS[factIndex];

  const live = matches.filter((m) => m.status === "live");
  const next = matches.filter((m) => m.status === "scheduled").slice(0, 4);
  const hasBracket = bracket.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-black p-4 text-white sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/20 pb-4">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={systemName}
            className="h-12 w-12 object-contain sm:h-16 sm:w-16 lg:h-20 lg:w-20"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              {tournamentName}
            </h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-white/60 sm:text-sm">
              {systemName}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-white/60">Probíhá</p>
          <p className="font-mono text-3xl font-bold tabular-nums sm:text-4xl lg:text-5xl">
            {elapsed}
          </p>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-6 py-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          {live.length > 0 ? (
            <>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-red-400">
                <LiveDot size="lg" />
                Živě
              </h2>
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

          {hasBracket && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="mb-6 text-xl font-semibold text-white/70">Pavouk</h2>
              <BracketView matches={bracket} variant="tv" />
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Na řadě</h2>
          <div className="space-y-2">
            {next.length === 0 ? (
              <p className="text-sm text-white/40">— nic dalšího —</p>
            ) : (
              next.map((m) => <NextUpCard key={m.id} match={m} />)
            )}
          </div>
        </section>
      </main>

      <footer className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-widest text-white/40">
          Věděli jste, že…
        </p>
        <p key={fact} className="mt-2 animate-in fade-in text-2xl font-light leading-snug">
          {fact}
        </p>
      </footer>
    </div>
  );
}

function BigMatchCard({ match }: { match: MatchListItem }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 sm:p-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/60">
        <span>
          #{match.number} · {match.phaseLabel}
        </span>
        <span>best of {match.bestOf}</span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:mt-4 sm:gap-6">
        <p
          className={`truncate text-right text-lg sm:text-2xl lg:text-3xl ${match.winnerSide === "A" ? "font-bold" : ""}`}
        >
          {match.playerA}
        </p>
        <p className="font-mono text-3xl font-bold tabular-nums sm:text-5xl lg:text-6xl">
          {match.scoreA} <span className="text-white/40">:</span> {match.scoreB}
        </p>
        <p
          className={`truncate text-left text-lg sm:text-2xl lg:text-3xl ${match.winnerSide === "B" ? "font-bold" : ""}`}
        >
          {match.playerB}
        </p>
      </div>
      {(match.oddsA != null || match.totalPool > 0) && (
        <div className="mt-4 flex items-center justify-between gap-6 border-t border-white/10 pt-3 text-sm">
          <OddsPill name={match.playerA} odds={match.oddsA} />
          <span className="text-xs uppercase tracking-widest text-white/40">
            Vsazeno{" "}
            <span className="ml-1 font-mono text-base text-white">
              {match.totalPool > 0 ? poolFmt.format(match.totalPool) : "—"}
            </span>
          </span>
          <OddsPill name={match.playerB} odds={match.oddsB} />
        </div>
      )}
    </div>
  );
}

function NextUpCard({ match }: { match: MatchListItem }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>#{match.number}</span>
        <span>
          {match.phaseLabel} · bo{match.bestOf}
        </span>
      </div>
      <p className="mt-2 text-lg font-semibold">
        {match.playerA} <span className="text-white/40">vs</span> {match.playerB}
      </p>
      {(match.oddsA != null || match.totalPool > 0) && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-white/10 px-2 py-1">
            <p className="truncate text-[10px] uppercase tracking-wider text-white/50">
              {match.playerA}
            </p>
            <p className="font-mono font-semibold">
              {match.oddsA != null ? match.oddsA.toFixed(2) : "—"}
            </p>
          </div>
          <div className="rounded border border-white/10 px-2 py-1">
            <p className="truncate text-[10px] uppercase tracking-wider text-white/50">
              {match.playerB}
            </p>
            <p className="font-mono font-semibold">
              {match.oddsB != null ? match.oddsB.toFixed(2) : "—"}
            </p>
          </div>
        </div>
      )}
      {match.totalPool > 0 && (
        <p className="mt-1 text-right text-xs text-white/40">
          Pool: {poolFmt.format(match.totalPool)}
        </p>
      )}
    </div>
  );
}

function OddsPill({ name, odds }: { name: string; odds: number | null }) {
  return (
    <div className="flex flex-col">
      <span className="truncate text-[10px] uppercase tracking-wider text-white/40">
        {name}
      </span>
      <span className="font-mono text-xl font-semibold">
        {odds != null ? odds.toFixed(2) : "—"}
      </span>
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
