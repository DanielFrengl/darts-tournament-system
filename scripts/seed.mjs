// =============================================================================
// scripts/seed.mjs — Destructive maintenance / reset script
// =============================================================================
//
// PURPOSE
//   Standalone, idempotent, TRANSACTIONAL maintenance script intended to be run
//   manually by the operator against their OWN database. It:
//     0. Ensures the 'debug' user_role enum value exists (own committed step).
//     1. Keeps ONLY the user "David Jan Zadražil"; deletes every other user
//        after first removing their FK-dependent rows.
//     2. Seeds/upserts the user Daniel Frengl (role 'debug').
//     3. Resets ALL remaining users' stats: capital -> default, and removes
//        their bets/parlays/transactions so stats are zeroed.
//     4. Deletes ALL tournaments and every tournament-scoped row, FK-safe.
//     5. Prints a summary and COMMITs. On any error: ROLLBACK + non-zero exit.
//
//   It is DESTRUCTIVE, so it REFUSES to run without the --confirm flag.
//
// USAGE
//   DATABASE_URL='postgres://user:pass@host:port/db' node scripts/seed.mjs --confirm
//
//   On Windows PowerShell:
//     $env:DATABASE_URL='postgres://...'; node scripts/seed.mjs --confirm
//
//   DATABASE_URL is read from the environment (same as scripts/migrate.mjs).
//   Re-runnable: running twice converges to the same state and does not error.
//
// =============================================================================

import postgres from "postgres";
// Password hashing: mirror src/lib/password.ts EXACTLY (@node-rs/argon2, Argon2id).
import { hash } from "@node-rs/argon2";

// -----------------------------------------------------------------------------
// 0. CLI guard: refuse to run without --confirm.
// -----------------------------------------------------------------------------
const args = process.argv.slice(2);
if (!args.includes("--confirm")) {
  console.error("✗ Refusing to run: this script is DESTRUCTIVE.");
  console.error("");
  console.error("  It deletes users, all tournaments, and resets stats.");
  console.error("  Re-run with the --confirm flag once you are sure:");
  console.error("");
  console.error("    DATABASE_URL='postgres://...' node scripts/seed.mjs --confirm");
  console.error("");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set in the runtime environment.");
  console.error("  Set it before running, e.g. DATABASE_URL='postgres://...'");
  process.exit(1);
}

// Mask password for logging (same approach as scripts/migrate.mjs).
const safeUrl = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");
console.log(`→ Connecting to: ${safeUrl}`);

// -----------------------------------------------------------------------------
// Connection setup: copied EXACTLY from scripts/migrate.mjs so prod/Railway
// behaviour is identical.
// -----------------------------------------------------------------------------
function resolveSsl(connectionString) {
  if (process.env.PGSSLMODE === "disable") return false;
  if (/\.railway\.internal/i.test(connectionString)) return false;
  if (/localhost|127\.0\.0\.1/i.test(connectionString)) return false;
  // Permissive SSL: encrypt but skip cert chain verification.
  // Railway's public proxy uses certs that can fail strict verification.
  return { rejectUnauthorized: false };
}

const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  ssl: resolveSsl(url),
  connect_timeout: 30,
  idle_timeout: 5,
  // Railway's public proxy pools connections in transaction mode,
  // which breaks prepared statements. Disable them for this script too.
  prepare: false,
});

// -----------------------------------------------------------------------------
// Constants (kept in sync with the app).
// -----------------------------------------------------------------------------

// Argon2id options — copied EXACTLY from src/lib/password.ts.
const ARGON2ID = 2; // Argon2id wire value (see @node-rs/argon2 .d.ts).
const ARGON2_OPTS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// Default starting capital.
// ASSUMPTION: the users.capital column default in src/db/schema.ts is "0", and
// there is no app_settings column for starting capital (the spec keeps
// `starting_capital` inside tournaments.config_json, but we delete all
// tournaments here). Per the task instruction "if unclear, use the schema
// column default", we reset capital to "0". Operator should double-check this
// matches their intent — change DEFAULT_CAPITAL below if a non-zero start is
// desired.
const DEFAULT_CAPITAL = "0";

// The single user to KEEP.
const KEEP_FIRST = "David";
const KEEP_LAST = "Jan Zadražil";
// Full display name as a fallback match (firstName + " " + lastName), tolerant
// of however the name happens to be split across the two columns.
const KEEP_FULL = "David Jan Zadražil";

// The user to SEED/UPSERT.
const SEED = {
  email: "daniel.frengl@gmail.com",
  firstName: "Daniel",
  lastName: "Frengl",
  password: "JBL12345!",
  role: "debug",
};

// -----------------------------------------------------------------------------
// Username slug — mirrors makeUsername() from src/lib/names.ts.
// -----------------------------------------------------------------------------
function makeUsername(firstName, lastName) {
  const combined = `${firstName}${lastName}`;
  const ascii = combined.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const slug = ascii.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.slice(0, 30);
}

// Find a free username given a base, mirroring findFreeUsername() semantics but
// implemented inside the transaction. Excludes a given user id so an UPSERT
// keeping its own username does not collide with itself.
async function findFreeUsername(tx, base, excludeUserId) {
  let candidate = base || "user";
  let suffix = 2;
  while (suffix < 50) {
    const rows = excludeUserId
      ? await tx`SELECT id FROM users WHERE username = ${candidate} AND id <> ${excludeUserId} LIMIT 1`
      : await tx`SELECT id FROM users WHERE username = ${candidate} LIMIT 1`;
    if (rows.length === 0) return candidate;
    candidate = `${base}${suffix}`;
    suffix++;
  }
  // Fallback: timestamp-suffixed (matches app behaviour).
  return `${base}${Date.now().toString(36)}`.slice(0, 40);
}

// -----------------------------------------------------------------------------
// Main.
// -----------------------------------------------------------------------------
async function main() {
  // ---------------------------------------------------------------------------
  // STEP 0 (OUTSIDE the main transaction): ensure the 'debug' enum value exists.
  // Postgres cannot use a newly added enum value in the same transaction that
  // added it, so this runs and commits on its own first. ADD VALUE IF NOT
  // EXISTS makes it idempotent and safe even if migrations already added it.
  // ---------------------------------------------------------------------------
  console.log("→ [0] Ensuring 'debug' user_role enum value exists…");
  // This statement auto-commits (not wrapped in sql.begin), satisfying the
  // "must be its own committed step" requirement.
  await sql.unsafe(`ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'debug'`);
  console.log("  ✓ 'debug' enum value present.");

  // Pre-compute the password hash OUTSIDE the transaction (argon2 is CPU-bound
  // and unrelated to DB state; keeps the transaction short).
  const seedPasswordHash = await hash(SEED.password, ARGON2_OPTS);

  // Summary counters, filled in during the transaction.
  const summary = {
    usersMatchedKeep: 0,
    keptUserId: null,
    usersDeleted: 0,
    seedUserUpdated: false,
    seedUserInserted: false,
    seedUserId: null,
    betsDeleted: 0,
    parlaysDeleted: 0,
    transactionsDeleted: 0,
    playersDetachedFromDeletedUsers: 0,
    usersCapitalReset: 0,
    tournamentsDeleted: 0,
    matchesDeleted: 0,
    legsDeleted: 0,
    marketsDeleted: 0,
    marketSelectionsDeleted: 0,
    groupsDeleted: 0,
    tournamentPlayersDeleted: 0,
  };

  // ---------------------------------------------------------------------------
  // Everything below runs in ONE transaction. sql.begin() COMMITs on resolve
  // and ROLLBACKs if the callback throws.
  // ---------------------------------------------------------------------------
  await sql.begin(async (tx) => {
    // -------------------------------------------------------------------------
    // STEP 1: identify the KEEP user(s).
    // Match case-insensitively on first_name + last_name, OR on the
    // concatenated "first last" display name (tolerant of how the name is
    // split across the two columns). We compare both the trimmed combined
    // "first last" string AND the raw concatenation against the target.
    // -------------------------------------------------------------------------
    console.log("→ [1] Identifying user to keep: \"David Jan Zadražil\"…");

    const keepRows = await tx`
      SELECT id, first_name, last_name, username, email
      FROM users
      WHERE
        -- exact split: first_name = "David", last_name = "Jan Zadražil"
        (lower(trim(first_name)) = lower(${KEEP_FIRST})
          AND lower(trim(last_name)) = lower(${KEEP_LAST}))
        -- fallback: the trimmed "first last" display name matches in full,
        -- regardless of how it is split across the two columns. Collapse any
        -- run of whitespace to a single space before comparing.
        OR lower(regexp_replace(trim(concat_ws(' ', trim(first_name), trim(last_name))), '\\s+', ' ', 'g'))
           = lower(${KEEP_FULL})
    `;

    summary.usersMatchedKeep = keepRows.length;
    const keepIds = keepRows.map((r) => r.id);

    if (keepRows.length === 0) {
      // Not fatal: the DB may not contain this user (idempotent re-run on a
      // DB where they were never present). We log loudly and continue; no user
      // is "kept", but the rest of the reset still applies.
      console.warn("  ⚠ No user matched \"David Jan Zadražil\". Keeping nobody by that name.");
    } else {
      summary.keptUserId = keepIds[0];
      console.log(
        `  ✓ Matched ${keepRows.length} keep-user(s): ` +
          keepRows
            .map((r) => `${r.first_name} ${r.last_name} <${r.email}> (${r.id})`)
            .join(", ")
      );
      if (keepRows.length > 1) {
        console.warn("  ⚠ More than one user matched the keep-name; keeping ALL of them.");
      }
    }

    // -------------------------------------------------------------------------
    // STEP 1 (cont.): delete all OTHER users, after removing FK-dependent rows.
    //
    // Users are referenced by (FK action in parentheses):
    //   transactions.user_id    (restrict)  -> must delete first
    //   transactions.created_by (set null)  -> null out
    //   bets.user_id            (restrict)  -> must delete first
    //   parlays.user_id         (restrict)  -> must delete first
    //   players.user_id         (set null)  -> detach (set null)
    //
    // Deletion order for the to-be-deleted users' dependent rows:
    //   1. bets        (child of parlays; also references users + selections)
    //   2. parlays
    //   3. transactions
    //   4. detach players (user_id -> NULL)
    //   5. delete the users themselves
    //
    // We compute "users to delete" as: every user NOT in keepIds.
    // -------------------------------------------------------------------------
    console.log("→ [1] Removing all other users and their dependent rows…");

    // Helper SQL fragment: the set of user ids to DELETE. When keepIds is empty
    // this is simply "all users".
    // We use a NOT IN guard built from the keepIds array.
    // postgres-js expands an array passed to `IN ${sql(array)}` — but for an
    // empty array that is invalid, so we branch.
    const hasKeep = keepIds.length > 0;

    // 1a. Delete bets belonging to users being deleted.
    const delBets = hasKeep
      ? await tx`DELETE FROM bets WHERE user_id NOT IN ${tx(keepIds)} RETURNING id`
      : await tx`DELETE FROM bets RETURNING id`;
    summary.betsDeleted += delBets.length;

    // 1b. Delete parlays belonging to users being deleted.
    //     (bets referencing these parlays were already removed above; remaining
    //     bets belong only to kept users and don't reference deleted parlays.)
    const delParlays = hasKeep
      ? await tx`DELETE FROM parlays WHERE user_id NOT IN ${tx(keepIds)} RETURNING id`
      : await tx`DELETE FROM parlays RETURNING id`;
    summary.parlaysDeleted += delParlays.length;

    // 1c. Detach transactions.created_by that points at users being deleted
    //     (set null), so the restrict on user_id is the only blocker we manage.
    if (hasKeep) {
      await tx`UPDATE transactions SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT IN ${tx(keepIds)} AND user_id IN ${tx(keepIds)}`;
    }

    // 1d. Delete transactions belonging to users being deleted.
    const delTx = hasKeep
      ? await tx`DELETE FROM transactions WHERE user_id NOT IN ${tx(keepIds)} RETURNING id`
      : await tx`DELETE FROM transactions RETURNING id`;
    summary.transactionsDeleted += delTx.length;

    // 1e. Detach players linked to users being deleted (user_id -> NULL).
    const detached = hasKeep
      ? await tx`UPDATE players SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN ${tx(keepIds)} RETURNING id`
      : await tx`UPDATE players SET user_id = NULL WHERE user_id IS NOT NULL RETURNING id`;
    summary.playersDetachedFromDeletedUsers = detached.length;

    // 1f. Now delete the users themselves.
    //     created_by on transactions belonging to KEPT users may still point at
    //     a soon-to-be-deleted user; null those out too (set null FK would do
    //     this, but we do it explicitly to be safe under any FK config).
    if (hasKeep) {
      await tx`UPDATE transactions SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT IN ${tx(keepIds)}`;
    } else {
      await tx`UPDATE transactions SET created_by = NULL WHERE created_by IS NOT NULL`;
    }

    const delUsers = hasKeep
      ? await tx`DELETE FROM users WHERE id NOT IN ${tx(keepIds)} RETURNING id`
      : await tx`DELETE FROM users RETURNING id`;
    summary.usersDeleted = delUsers.length;
    console.log(`  ✓ Deleted ${summary.usersDeleted} user(s); kept ${keepIds.length}.`);

    // -------------------------------------------------------------------------
    // STEP 2: seed/upsert Daniel Frengl with role 'debug'.
    // If a user with that email exists, UPDATE it; otherwise INSERT.
    // Idempotent by design (matched on the unique email column).
    // -------------------------------------------------------------------------
    console.log(`→ [2] Upserting seed user <${SEED.email}> (role '${SEED.role}')…`);

    const existing = await tx`SELECT id, username FROM users WHERE email = ${SEED.email} LIMIT 1`;

    if (existing.length > 0) {
      const seedId = existing[0].id;
      // Keep the existing username if it is already the derived slug; otherwise
      // recompute a free one (excluding self).
      const base = makeUsername(SEED.firstName, SEED.lastName);
      const username =
        existing[0].username === base
          ? base
          : await findFreeUsername(tx, base, seedId);

      await tx`
        UPDATE users
        SET first_name = ${SEED.firstName},
            last_name = ${SEED.lastName},
            username = ${username},
            password_hash = ${seedPasswordHash},
            role = ${SEED.role}
        WHERE id = ${seedId}
      `;
      summary.seedUserUpdated = true;
      summary.seedUserId = seedId;
      console.log(`  ✓ Updated existing seed user (${seedId}), username '${username}'.`);
    } else {
      const base = makeUsername(SEED.firstName, SEED.lastName);
      const username = await findFreeUsername(tx, base, null);
      const inserted = await tx`
        INSERT INTO users (email, username, first_name, last_name, password_hash, role, capital)
        VALUES (${SEED.email}, ${username}, ${SEED.firstName}, ${SEED.lastName},
                ${seedPasswordHash}, ${SEED.role}, ${DEFAULT_CAPITAL})
        RETURNING id
      `;
      summary.seedUserInserted = true;
      summary.seedUserId = inserted[0].id;
      console.log(`  ✓ Inserted seed user (${inserted[0].id}), username '${username}'.`);
    }

    // -------------------------------------------------------------------------
    // STEP 3: reset ALL remaining users' stats.
    //   - delete every bet / parlay / transaction (zeroes betting stats)
    //   - reset capital to DEFAULT_CAPITAL
    // At this point only kept users + the seed user remain, so we operate on
    // the whole tables. bets reference parlays (cascade) but we delete bets
    // first anyway to be FK-safe under any config.
    // -------------------------------------------------------------------------
    console.log("→ [3] Resetting stats for all remaining users…");

    const allBets = await tx`DELETE FROM bets RETURNING id`;
    summary.betsDeleted += allBets.length;

    const allParlays = await tx`DELETE FROM parlays RETURNING id`;
    summary.parlaysDeleted += allParlays.length;

    // created_by can reference users; null them before deleting transactions is
    // unnecessary since we delete ALL transactions here.
    const allTx = await tx`DELETE FROM transactions RETURNING id`;
    summary.transactionsDeleted += allTx.length;

    const reset = await tx`UPDATE users SET capital = ${DEFAULT_CAPITAL} RETURNING id`;
    summary.usersCapitalReset = reset.length;
    console.log(
      `  ✓ Reset capital -> ${DEFAULT_CAPITAL} for ${reset.length} user(s); ` +
        `cleared all bets/parlays/transactions.`
    );

    // -------------------------------------------------------------------------
    // STEP 4: delete ALL tournaments and tournament-scoped rows, FK-safe.
    //
    // Tournament-scoped tables and their FK references:
    //   market_selections -> markets (cascade), players (set null)
    //   markets           -> tournaments (cascade), matches (cascade), legs (cascade)
    //   legs              -> matches (cascade)
    //   matches           -> tournaments (cascade), groups (cascade), players (set null)
    //   players           -> tournaments (cascade), users (set null), groups (set null)
    //   groups            -> tournaments (cascade)
    //   tournaments       -> (root)
    //
    // Delete leaves first, roots last. bets referenced market_selections
    // (restrict) but all bets are already gone (step 3), so selections delete
    // freely.
    //   1. market_selections
    //   2. markets
    //   3. legs
    //   4. matches
    //   5. players (tournament-scoped — all of them)
    //   6. groups
    //   7. tournaments
    // -------------------------------------------------------------------------
    console.log("→ [4] Deleting all tournaments and tournament-scoped rows…");

    const ms = await tx`DELETE FROM market_selections RETURNING id`;
    summary.marketSelectionsDeleted = ms.length;

    const mk = await tx`DELETE FROM markets RETURNING id`;
    summary.marketsDeleted = mk.length;

    const lg = await tx`DELETE FROM legs RETURNING id`;
    summary.legsDeleted = lg.length;

    const mt = await tx`DELETE FROM matches RETURNING id`;
    summary.matchesDeleted = mt.length;

    // players are entirely tournament-scoped (tournament_id is NOT NULL), so
    // every player belongs to a tournament being deleted.
    const pl = await tx`DELETE FROM players RETURNING id`;
    summary.tournamentPlayersDeleted = pl.length;

    const gr = await tx`DELETE FROM groups RETURNING id`;
    summary.groupsDeleted = gr.length;

    const tr = await tx`DELETE FROM tournaments RETURNING id`;
    summary.tournamentsDeleted = tr.length;

    console.log(
      `  ✓ Deleted ${summary.tournamentsDeleted} tournament(s) and all scoped rows.`
    );

    // sql.begin resolves here -> COMMIT.
  });

  // ---------------------------------------------------------------------------
  // STEP 5: print the summary (transaction already committed).
  // ---------------------------------------------------------------------------
  console.log("");
  console.log("============================================================");
  console.log(" SEED / RESET COMPLETE — COMMITTED");
  console.log("============================================================");
  console.log(` Keep-user matched count : ${summary.usersMatchedKeep}`);
  console.log(` Keep-user id            : ${summary.keptUserId ?? "(none)"}`);
  console.log(` Users deleted           : ${summary.usersDeleted}`);
  console.log(
    ` Seed user (Daniel)      : ${
      summary.seedUserInserted ? "INSERTED" : summary.seedUserUpdated ? "UPDATED" : "(none)"
    } (${summary.seedUserId ?? "?"})`
  );
  console.log(` Capital reset to ${DEFAULT_CAPITAL.padEnd(6)} : ${summary.usersCapitalReset} user(s)`);
  console.log(` Bets deleted (total)    : ${summary.betsDeleted}`);
  console.log(` Parlays deleted (total) : ${summary.parlaysDeleted}`);
  console.log(` Transactions deleted    : ${summary.transactionsDeleted}`);
  console.log(` Players detached        : ${summary.playersDetachedFromDeletedUsers}`);
  console.log(" ---------------------------------------------------------");
  console.log(` Tournaments deleted     : ${summary.tournamentsDeleted}`);
  console.log(` Matches deleted         : ${summary.matchesDeleted}`);
  console.log(` Legs deleted            : ${summary.legsDeleted}`);
  console.log(` Markets deleted         : ${summary.marketsDeleted}`);
  console.log(` Market selections del.  : ${summary.marketSelectionsDeleted}`);
  console.log(` Groups deleted          : ${summary.groupsDeleted}`);
  console.log(` Tournament players del. : ${summary.tournamentPlayersDeleted}`);
  console.log("============================================================");
}

// -----------------------------------------------------------------------------
// Runner: ensure the connection is always closed; non-zero exit on error.
// -----------------------------------------------------------------------------
try {
  await main();
  await sql.end({ timeout: 5 });
  process.exit(0);
} catch (err) {
  // The transaction (sql.begin) auto-rolls-back on throw; the enum step in
  // STEP 0 is idempotent and harmless if already committed.
  console.error("✗ Seed failed — transaction rolled back. No changes committed by the main step.");
  console.error(`  message: ${err?.message}`);
  console.error(`  code: ${err?.code ?? err?.cause?.code}`);
  console.error(`  detail: ${err?.detail ?? err?.cause?.detail ?? "(none)"}`);
  if (err?.stack) console.error(err.stack);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
