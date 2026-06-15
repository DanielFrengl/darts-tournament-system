// E2E fixture: seeds a minimal live-betting scenario directly via SQL.
//
// We talk raw SQL through `postgres` (NOT the app's drizzle client, which is
// `server-only` and cannot be imported from the Playwright test process).
// Passwords are hashed with the same @node-rs/argon2 params as src/lib/password.ts
// so the real login flow verifies them.
//
// Scenario:
//   - tournament "E2E Live Betting" (status groups)
//   - 1 group, 2 players (Alice, Bob)
//   - 1 best-of-1 scheduled group match Alice vs Bob
//   - 1 open match_winner market with two 2.00 selections
//   - bettor user (role user, 1000 capital) + debug user (scores the match)
//
// Idempotent: wipes any prior rows for these fixed emails / tournament name
// before re-inserting, so the suite can run repeatedly.

import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

const ARGON2ID = 2;
const HASH_OPTS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const FIXTURE = {
  tournamentName: "E2E Live Betting",
  bettor: { email: "bettor@e2e.test", username: "e2e_bettor", password: "bet12345pw" },
  admin: { email: "admin-dbg@e2e.test", username: "e2e_admindbg", password: "JBL12345!" },
};

const CONFIG = {
  groupCount: 2,
  groupSize: 4,
  advancePerGroup: 2,
  bestOfGroup: 3,
  bestOfQuarter: 5,
  bestOfSemi: 5,
  bestOfFinal: 7,
  thirdPlaceMatch: false,
  crossSeedingPattern: "standard",
  startingCapital: 1000,
  parimutuelThreshold: 5000,
  houseEdge: 0,
  totalLegsLineDelta: 0.5,
  triple20sLine: 50,
  enabledMarkets: ["match_winner", "correct_score", "leg_winner"],
};

export async function seedLiveBetting(connectionString) {
  const sql = postgres(connectionString, { max: 1, ssl: false, prepare: false });
  try {
    const bettorHash = await hash(FIXTURE.bettor.password, HASH_OPTS);
    const adminHash = await hash(FIXTURE.admin.password, HASH_OPTS);

    const ids = await sql.begin(async (tx) => {
      // --- clean prior fixture data ---
      // Order matters: bets have an onDelete:"restrict" FK to market_selections,
      // so the fixture user's bets must go BEFORE the tournament cascade-deletes
      // its selections. Then transactions, then the tournament, then the users.
      const emails = [FIXTURE.bettor.email, FIXTURE.admin.email];
      await tx`DELETE FROM bets WHERE user_id IN (SELECT id FROM users WHERE email = ANY(${emails}))`;
      await tx`DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE email = ANY(${emails}))`;
      await tx`DELETE FROM tournaments WHERE name = ${FIXTURE.tournamentName}`;
      await tx`DELETE FROM users WHERE email = ANY(${emails})`;

      // --- users ---
      const bettorId = randomUUID();
      const adminId = randomUUID();
      await tx`
        INSERT INTO users (id, email, username, first_name, last_name, password_hash, role, capital)
        VALUES
          (${bettorId}, ${FIXTURE.bettor.email}, ${FIXTURE.bettor.username}, 'Sázkař', 'Testovací', ${bettorHash}, 'user', '1000.00'),
          (${adminId}, ${FIXTURE.admin.email}, ${FIXTURE.admin.username}, 'Daniel', 'Debug', ${adminHash}, 'debug', '1000.00')
      `;

      // --- tournament / group / players ---
      const tournamentId = randomUUID();
      await tx`
        INSERT INTO tournaments (id, name, status, config_json, started_at)
        VALUES (${tournamentId}, ${FIXTURE.tournamentName}, 'groups', ${sql.json(CONFIG)}, now())
      `;
      const groupId = randomUUID();
      await tx`
        INSERT INTO groups (id, tournament_id, name, position)
        VALUES (${groupId}, ${tournamentId}, 'A', 0)
      `;
      const playerAId = randomUUID();
      const playerBId = randomUUID();
      await tx`
        INSERT INTO players (id, tournament_id, name, group_id, seed, elo_rating)
        VALUES
          (${playerAId}, ${tournamentId}, 'Alice', ${groupId}, 1, 1500),
          (${playerBId}, ${tournamentId}, 'Bob', ${groupId}, 2, 1500)
      `;

      // --- best-of-1 scheduled match ---
      const matchId = randomUUID();
      await tx`
        INSERT INTO matches (id, tournament_id, phase, group_id, player_a_id, player_b_id, best_of, status, score_a, score_b)
        VALUES (${matchId}, ${tournamentId}, 'group', ${groupId}, ${playerAId}, ${playerBId}, 1, 'scheduled', 0, 0)
      `;

      // --- open match_winner market with two even selections ---
      const marketId = randomUUID();
      await tx`
        INSERT INTO markets (id, tournament_id, match_id, type, scope, status)
        VALUES (${marketId}, ${tournamentId}, ${matchId}, 'match_winner', 'match', 'open')
      `;
      const selAId = randomUUID();
      const selBId = randomUUID();
      await tx`
        INSERT INTO market_selections (id, market_id, label, player_id, stat_odds, final_odds)
        VALUES
          (${selAId}, ${marketId}, 'Alice', ${playerAId}, '2.0000', '2.0000'),
          (${selBId}, ${marketId}, 'Bob', ${playerBId}, '2.0000', '2.0000')
      `;

      return {
        tournamentId,
        groupId,
        matchId,
        marketId,
        playerAId,
        playerBId,
        selAId,
        selBId,
        bettorId,
        adminId,
      };
    });

    return { ...FIXTURE, ...ids };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
