import Link from "next/link";
import type { Metadata } from "next";
import { getAppSettings } from "@/lib/settings";
import { CopyCode } from "@/components/info/CopyCode";

export const metadata: Metadata = {
  title: "Info: Jabloňová Open #4",
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
  { name: "Jéňa", elo: 1514 },
  { name: "Filip", elo: 1500, note: "nový na turnaji" },
  { name: "Aleš", elo: 1500, note: "nový na turnaji" },
  { name: "Volkie", elo: 1484 },
  { name: "Singl", elo: 1474 },
  { name: "Alina", elo: 1469 },
  { name: "Anežka", elo: 1469 },
  { name: "Pavel", elo: 1467 },
  { name: "Matyáš", elo: 1465 },
  { name: "Kovy", elo: 1418 },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold tracking-tight">{children}</h2>;
}

export default async function InfoPage() {
  const settings = await getAppSettings();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8 flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={settings.logoUrl}
          alt={settings.name}
          className="h-16 w-16 object-contain"
        />
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Zdravím budoucí soutěžící čtvrté Jabloňové Open!
        </h1>
        <p className="text-muted-foreground">
          Turnaj je už zítra v 18:00. Máme pro vás s Davidem pár novinek.
        </p>
      </header>

      <article className="divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* 1. App + registration */}
        <section className="px-6 py-7 sm:px-8">
          <SectionTitle>1. Nová sázkařská aplikace</SectionTitle>

          <div className="mt-4 flex flex-col items-start gap-3 rounded-xl bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Zvací kód</span>
              <div className="mt-1">
                <CopyCode code="jablonova69" />
              </div>
            </div>
            <Link
              href="/register"
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:w-auto"
            >
              Zaregistrovat se
            </Link>
          </div>

          <p className="mt-6 text-sm font-medium">Co v appce najdete:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              Sázení na zápasy i na celkového vítěze, sází se virtuální měna
              „jablka“
            </li>
            <li>
              Živé kurzy a skóre, žebříček hráčů i sázkařů, profil se
              statistikami
            </li>
            <li>
              Chytré počítání kurzů: appka spočítá sílu (rating) každého hráče z
              minulých turnajů, pak tisíckrát nasimuluje celý turnaj (
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

        {/* Ratings */}
        <section className="px-6 py-7 sm:px-8">
          <SectionTitle>Aktuální síla hráčů z předešlých turnajů</SectionTitle>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Disclaimer: o elu nestranně rozhodl vypočítávací algoritmus a pak to
            přehodnotila AI na bázi kontextu dat.
          </p>

          <ol className="mt-4 divide-y divide-border overflow-hidden rounded-xl border">
            {RATINGS.map((r, i) => (
              <li
                key={r.name}
                className="flex items-center justify-between px-4 py-2 text-sm"
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
                <span className="tabular-nums text-muted-foreground">
                  {r.elo}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-4 text-xs text-muted-foreground">
            Bohužel se nám podařilo sehnat kompletní data jen z 1. a 3. turnaje,
            z 2. jen částečně, takže ratingy nejsou na 4. turnaj 100 % přesné.
            To se změní, jakmile nasbíráme víc dat v průběhu. Kdo je nový,
            získal automaticky průměr ela 1500.
          </p>
        </section>

        {/* 2. Trophy */}
        <section className="px-6 py-7 sm:px-8">
          <SectionTitle>2. Sázkařská trofej</SectionTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Hraje se i o trofej pro nejlepšího sázkaře. Získá ji ten, kdo bude
            mít na konci turnaje nejvíc jablek. Stav sledujete v žebříčku
            sázkařů.
          </p>
          <figure className="mt-4 flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trofej.jpg"
              alt="Sázkařská trofej Jabloňová Open, stříbrné jablko s šipkou"
              className="w-full max-w-xs rounded-xl border object-cover"
            />
            <figcaption className="text-xs text-muted-foreground">
              Děkujeme Tomáši Frenglovi za tisk a design trofeje.
            </figcaption>
          </figure>
        </section>

        {/* Bug reports */}
        <section className="px-6 py-7 sm:px-8">
          <SectionTitle>Našli jste chybu?</SectionTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Appka je zatím prototyp a budeme ji průběžně vylepšovat a doplňovat.
            Když na něco narazíte, dejte nám vědět. Přímo v appce přibude
            tlačítko „Nahlásit chybu“, nebo mi napište na IG{" "}
            <a
              href="https://instagram.com/daniel.frengl"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              @daniel.frengl
            </a>
            .
          </p>
        </section>

        {/* Future */}
        <section className="px-6 py-7 sm:px-8">
          <SectionTitle>Na co se můžete těšit do budoucna</SectionTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Po včerejší diskuzi s Filipem jsme si říkali, že by bylo docela cool
            ještě postavit program na zachytávání samotných hodů, což by pomohlo
            udělat kurzy a predikce ještě přesnější. Tak uvidíme, jestli se k
            tomu dostaneme.
          </p>
        </section>
      </article>

      <p className="mt-8 text-lg font-medium">
        Dotazy a návrhy na vylepšení si nechte na zítra, ještě vám to na místě
        celé vysvětlím. Uvidíme se zítra!
        <br />
        <span className="font-normal italic">-Daniel Frengl</span>
      </p>
    </main>
  );
}
