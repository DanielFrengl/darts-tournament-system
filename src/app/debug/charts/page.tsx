import type { Metadata } from "next";
import {
  LeaderboardCharts,
  type LeaderboardRow,
} from "@/components/leaderboard/LeaderboardCharts";
import { EloChart } from "@/components/elo/EloChart";

export const metadata: Metadata = {
  title: "Debug — grafy",
  robots: { index: false, follow: false },
};

const NAMES = [
  ["honza", "Honza Novák"],
  ["petr", "Petr Svoboda"],
  ["bohy", "Jan Bohumil"],
  ["radim", "Radim Krátký"],
  ["dan", "Daniel Frengl"],
  ["jena", "Jena Dvořák"],
  ["filip", "Filip Veselý"],
  ["volkie", "Adam Volk"],
  ["singl", "Adam Singl"],
  ["alina", "Alina Horáková"],
  ["anezka", "Anežka Malá"],
  ["kovy", "Tomáš Kovář"],
];

// Deterministic pseudo-random so the mock is stable.
function rnd(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const MOCK_ROWS: LeaderboardRow[] = NAMES.map(([username, displayName], i) => {
  const totalStaked = Math.round(300 + rnd(i + 1) * 1500);
  const netProfit = Math.round((rnd(i + 7) - 0.45) * 900);
  const totalReturn = totalStaked + netProfit;
  const betCount = 6 + Math.floor(rnd(i + 13) * 24);
  const won = Math.floor(betCount * (0.25 + rnd(i + 19) * 0.5));
  const lost = betCount - won;
  const settled = won + lost;
  return {
    userId: String(i + 1),
    username: username!,
    displayName: displayName!,
    capital: Math.max(0, 1000 + netProfit),
    totalStaked,
    totalReturn,
    netProfit,
    roi: totalStaked > 0 ? (netProfit / totalStaked) * 100 : null,
    betCount,
    won,
    lost,
    refunded: 0,
    open: Math.floor(rnd(i + 23) * 3),
    winRate: settled > 0 ? (won / settled) * 100 : null,
  };
});

const MOCK_ELO = NAMES.map(([, displayName], i) => ({
  name: displayName!,
  elo: Math.round(1420 + rnd(i + 31) * 180),
})).sort((a, b) => b.elo - a.elo);

export default function DebugChartsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Debug — grafy</h1>
        <p className="text-sm text-muted-foreground">
          Náhled grafů na mock datech. Zmenši okno / otevři na mobilu pro test
          responzivity.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Leaderboard — přepínání metrik a typů</h2>
        <LeaderboardCharts rows={MOCK_ROWS} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Elo graf</h2>
        <EloChart rows={MOCK_ELO} />
      </section>
    </main>
  );
}
