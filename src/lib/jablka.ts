// Czech plural for the in-app currency "jablko" (apple).
// CLDR cardinal: 1 → jablko (one), 2–4 → jablka (few), 0 / 5+ → jablek (other).
// We always display whole numbers, so rounding to an integer is enough.

const fmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });

export function jablkaWord(value: number): string {
  const n = Math.abs(Math.round(value));
  if (n === 1) return "jablko";
  if (n >= 2 && n <= 4) return "jablka";
  return "jablek";
}

/** Number + correctly pluralised unit, e.g. "1 jablko", "3 jablka", "1 000 jablek". */
export function formatJablka(value: number): string {
  return `${fmt.format(value)} ${jablkaWord(value)}`;
}
