import Link from "next/link";
import type { Metadata } from "next";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Info — Jablonova Open #4",
  description:
    "Ctvrte Jablonova Open je uz zitra v 18:00. Nova sazkarska aplikace, kurzy, trofej pro nejlepsiho sazkare.",
  robots: { index: false, follow: false },
};

const RATINGS: { name: string; elo: number; note?: string }[] = [
  { name: "David", elo: 1583 },
  { name: "Honza", elo: 1548 },
  { name: "Bohy", elo: 1548 },
  { name: "Radim", elo: 1538 },
  { name: "Dan", elo: 1523 },
  { name: "Jena", elo: 1514 },
  { name: "Filip", elo: 1500, note: "novacek" },
  { name: "Volkie", elo: 1484 },
  { name: "Singl", elo: 1474 },
  { name: "Alina", elo: 1469 },
  { name: "Anezka", elo: 1469 },
  { name: "Pavel", elo: 1467 },
  { name: "Matyas", elo: 1465 },
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
          Zdravim budouci soutezici ctvrte Jablonove Open
        </h1>
        <p className="text-muted-foreground">
          Turnaj je uz zitra v 18:00. Mame pro vas s Davidem par novinek.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">1. Nova sazkarska aplikace</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Zaregistrovat se muzete zde. Zvaci kod:{" "}
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
            sazeni na zapasy i na celkoveho viteze, sazi se virtualni mena
            &quot;jablka&quot;
          </li>
          <li>
            zive kurzy a skore, zebricek hracu i sazkaru, profil se statistikami
          </li>
          <li>
            chytre pocitani kurzu: appka spocita silu (rating) kazdeho hrace z
            minulych turnaju, pak tisickrat nasimuluje cely turnaj (
            <a
              href="https://cs.wikipedia.org/wiki/Metoda_Monte_Carlo"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Monte Carlo metoda
            </a>
            ) a z toho urci kurzy. Vyhra nad silnejsim souperem se pocita vic.
            Cim vic zapasu se odehraje, tim presnejsi to bude.
          </li>
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">
          Aktualni sila hracu z predeslych turnaju
        </h2>
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
              <span className="tabular-nums text-muted-foreground">
                {r.elo}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Bohuzel se nam podarilo sehnat kompletni data jen z 1. a 3. turnaje, z
          2. jen castecne, takze ratingy nejsou na 4. turnaj 100% presne. To se
          zmeni, jakmile nasbirame vic dat v prubehu. Kdo je novy, ziskal
          automaticky prumer ela 1500.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          DISCLAIMER: O elu nestranne rozhodl vypocitavaci algoritmus a pak to
          prehodnotilo AI na bazi kontextu dat.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">2. Sazkarska trofej</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hraje se i o trofej pro nejlepsiho sazkare - ziska ji ten, kdo bude
          mit na konci turnaje nejvic jablek. Stav sledujete v zebricku
          sazkaru.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Nasli jste chybu?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Appka je zatim prototyp a budeme ji prubezne vylepsovat a doplnovat.
          Kdyz na neco narazite, dejte nam vedet - primo v appce pribude
          tlacitko &quot;Nahlasit chybu&quot;, nebo nam napiste.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">Na co se muzete tesit do budoucna</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Po vcerejsi diskuzi s Filipem jsme si rikali, ze by bylo docela cool
          jeste postavit program na zachytavani samotnych hodu, coz by pomohlo
          udelat kurzy a predikce jeste presnejsi - tak uvidime, jestli se k
          tomu dostaneme.
        </p>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        Dotazy a navrhy na vylepseni si nechte na zitra, jeste vam to na miste
        cele vysvetlim. Uvidime se zitra! - Daniel
      </p>
    </main>
  );
}
