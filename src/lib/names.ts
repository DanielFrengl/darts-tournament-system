// Centralized helpers for user-facing names and slug-based usernames.

export type NamedUser = {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
};

/** Renders a user's display name. Falls back to username for legacy rows. */
export function displayName(u: NamedUser): string {
  const fn = (u.firstName ?? "").trim();
  const ln = (u.lastName ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full.length > 0 ? full : u.username;
}

/**
 * Slugifies "First Last" into a username-safe handle:
 * - lowercase
 * - strips diacritics (á → a, č → c)
 * - non [a-z0-9] becomes empty
 * Returns "" if nothing usable remains.
 */
export function makeUsername(firstName: string, lastName: string): string {
  const combined = `${firstName}${lastName}`;
  const ascii = combined.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const slug = ascii.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.slice(0, 30);
}
