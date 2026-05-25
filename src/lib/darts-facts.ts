export const DARTS_FACTS: string[] = [
  "Maximální hod jedním šípem je 60 bodů (T20).",
  "Maximální vyhozený leg je 9 šipek (170+167+170 nebo 180+180+141).",
  "Černá zóna mezi 13 a 6 patří k nejvíc trestajícím sektorům — kdo netrefí dvacítku, často skončí tam.",
  "Profesionální průměr na leg je ~95–105 bodů na 3 šipky.",
  "Phil Taylor vyhrál 16× mistrovství světa — nejvíc v historii.",
  "Šipka váží mezi 18 a 26 gramy. Tradiční volba pro amatéry je 22 g.",
  "Vzdálenost od oche k terči je 2,37 m, výška středu 1,73 m.",
  "Vyhrávací sekvence se jmenuje checkout — nejvyšší možný je 170 (T20–T20–Bull).",
  "180 bodů (3× T20) je svatý grál začátečníka.",
  "Při vyrovnaném zápasu rozhoduje decider leg — bo3 → 1:1, bo5 → 2:2, atd.",
  "Triple je vnitřní úzký kruh, double je vnější. Bullseye = 50, vnější bull = 25.",
  "Originální 501 znamená že začínáš na 501 a musíš dosáhnout přesně 0 dvojkou.",
  "Eric Bristow zvaný Crafty Cockney byl pětinásobný mistr světa v 80. letech.",
  "Michael van Gerwen překonal hranici 100 stovek hozených v jednom turnaji.",
  "PDC World Championship má prize money přes 2,5 milionu liber.",
  "Hra na ruční zápis pochází z britských pubů přelomu 19. a 20. století.",
  "Tříhlavá kombinace zvaná madhouse = double 1, paradoxně nejtěžší checkout.",
  "Šipky se nevyrábějí z olova už od 70. let — dnes wolfram pro vyšší hustotu.",
  "Pravidlo best-of-N legs (first to ceil(N/2)) platí všude od pubu po PDC.",
];

export function pickFact(seed: number): string {
  const idx = Math.abs(seed) % DARTS_FACTS.length;
  return DARTS_FACTS[idx]!;
}
