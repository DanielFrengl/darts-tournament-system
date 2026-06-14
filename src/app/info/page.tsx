import Link from "next/link";
import type { Metadata } from "next";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Info — Jabloňová Open #4",
  description:
    "Čtvrtá Jabloňová Open je už zítra v 18:00. Nová sázkařská aplikace, kurzy, trofej pro nejlepšího sázkaře.",
  robots: { index: false, follow: false },
};

const RATINGS: { name: string; elo: number; note?: string }[] = [
  { name: "David", elo: 1583 },
  { name: "Honza", elo: 1548 },
  { name: "Bohy", elo: 1548 },
  { name: "Radim", elo: 1538 },
  { name: "Dan", elo: 1523 },
  { name: "Jena", elo: 1514 },
  { name: "Filip", elo: 1500, note: "nováček" },
  { name: "Volkie", elo: 1484 },
  { name: "Singl", elo: 1474 },
  { name: "Alina", elo: 1469 },
  { name: "Anežka", elo: 1469 },
  { name: "Pavel", elo: 1467 },
  { name: "Matyáš", elo: 1465 },
  { name: "Kovy", elo: 1418 },
];

export default async function InfoPage() {
  const settings = await getAppSettings();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-5 py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={settings.logoUrl}
          alt={settings.name}
          className="h-20 w-20 object-contain"
        />
        <h1 className="text-2xl font-bold tracking-tight">
          Zdravím budoucí soutěžící čtvrté Jabloňové Open
        </h1>
        <p className="text-muted-foreground">
          Turnaj je už zítra v 18:00. Máme pro vás s Davidem pár novinek.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">1. Nová sázkařská aplikace</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Zaregistrovat se můžete zde. Zvací kód:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            jablonova69
          </code>
        </p>
        <Link
          href="/register"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Zaregistrovat se
        </Link>

        <p className="mt-6 text-sm font-medium">Co v appce najdete:</p>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>
            sázení na zápasy i na celkového vítěze, sází se virtuální měna
            „jablka“
          </li>
          <li>
            živé kurzy a skóre, žebříček hráčů i sázkařů, profil se statistikami
          </li>
          <li>
            chytré počítání kurzů: appka spočítá sílu (rating) každého hráče
            z minulých turnajů, pak tisíckrát nasimuluje celý turnaj (
            <a
              href="https://cs.wikipedia.org/wiki/Metoda_Monte_Carlo"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Monte Carlo metoda
            </a>
            ) a z toho určí kurzy. Výhra nad silnějším soupeřem se počítá víc.
            Čím víc zápasů se odehraje, tím přesnější to bude.
          </li>
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">
          Aktuální síla hráčů z předešlých turnajů
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Disclaimer: o elu nestranně rozhodl vypočítávací algoritmus a pak to
          přehodnotila AI na bázi kontextu dat.
        </p>
        <ol className="mt-3 divide-y divide-border">
          {RATINGS.map((r, i) => (
            <li
              key={r.name}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-right tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span className="font-medium">{r.name}</span>
                {r.note && (
                  <span className="text-xs text-muted-foreground">
                    ({r.note})
                  </span>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">{r.elo}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Bohužel se nám podařilo sehnat kompletní data jen z 1. a 3. turnaje,
          z 2. jen částečně, takže ratingy nejsou na 4. turnaj 100 % přesné.
          To se změní, jakmile nasbíráme víc dat v průběhu. Kdo je nový, získal
          automaticky průměr ela 1500.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">2. Sázkařská trofej</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hraje se i o trofej pro nejlepšího sázkaře – získá ji ten, kdo bude
          mít na konci turnaje nejvíc jablek. Stav sledujete v žebříčku sázkařů.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Našli jste chybu?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Appka je zatím prototyp a budeme ji průběžně vylepšovat a doplňovat.
          Když na něco narazíte, dejte nám vědět – přímo v appce přibude
          tlačítko „Nahlásit chybu“, nebo nám napište.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">
          Na co se můžete těšit do budoucna
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Po včerejší diskuzi s Filipem jsme si říkali, že by bylo docela cool
          ještě postavit program na zachytávání samotných hodů, což by pomohlo
          udělat kurzy a predikce ještě přesnější – tak uvidíme, jestli se
          k tomu dostaneme.
        </p>
      </section>

      <p className="text-center text-lg font-medium text-foreground">
        Dotazy a návrhy na vylepšení si nechte na zítra, ještě vám to na místě
        celé vysvětlím. Uvidíme se zítra! – Daniel
      </p>
    </main>
  );
}
