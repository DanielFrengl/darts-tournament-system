import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "initial",
  "bet_placed",
  "bet_won",
  "bet_refund",
  "admin_adjust",
  "tournament_reset",
]);

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "draft",
  "groups",
  "playoff",
  "finished",
]);

export const matchPhaseEnum = pgEnum("match_phase", [
  "group",
  "quarter",
  "semi",
  "final",
  "third_place",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "scheduled",
  "live",
  "finished",
  "cancelled",
]);

export const legStatusEnum = pgEnum("leg_status", ["pending", "live", "finished"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 20 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  role: userRoleEnum("role").notNull().default("user"),
  capital: numeric("capital", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: transactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
    betId: uuid("bet_id"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("transactions_user_idx").on(t.userId),
    createdAtIdx: index("transactions_created_at_idx").on(t.createdAt),
  })
);

export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  status: tournamentStatusEnum("status").notNull().default("draft"),
  configJson: jsonb("config_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 16 }).notNull(),
    position: integer("position").notNull(),
  },
  (t) => ({
    tournamentIdx: index("groups_tournament_idx").on(t.tournamentId),
    tournamentNameUq: uniqueIndex("groups_tournament_name_uq").on(t.tournamentId, t.name),
  })
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    avatarUrl: text("avatar_url"),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    seed: integer("seed"),
    eloRating: integer("elo_rating").notNull().default(1500),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tournamentIdx: index("players_tournament_idx").on(t.tournamentId),
    groupIdx: index("players_group_idx").on(t.groupId),
  })
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    phase: matchPhaseEnum("phase").notNull(),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    bracketRound: integer("bracket_round"),
    bracketPosition: integer("bracket_position"),
    playerAId: uuid("player_a_id").references(() => players.id, { onDelete: "set null" }),
    playerBId: uuid("player_b_id").references(() => players.id, { onDelete: "set null" }),
    bestOf: integer("best_of").notNull(),
    status: matchStatusEnum("status").notNull().default("scheduled"),
    scoreA: integer("score_a").notNull().default(0),
    scoreB: integer("score_b").notNull().default(0),
    winnerId: uuid("winner_id").references(() => players.id, { onDelete: "set null" }),
    avgA: numeric("avg_a", { precision: 6, scale: 2 }),
    avgB: numeric("avg_b", { precision: 6, scale: 2 }),
    t20A: integer("t20_a"),
    t20B: integer("t20_b"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    tournamentIdx: index("matches_tournament_idx").on(t.tournamentId),
    groupIdx: index("matches_group_idx").on(t.groupId),
    statusIdx: index("matches_status_idx").on(t.status),
  })
);

export const legs = pgTable(
  "legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    legNumber: integer("leg_number").notNull(),
    winnerId: uuid("winner_id").references(() => players.id, { onDelete: "set null" }),
    status: legStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    matchIdx: index("legs_match_idx").on(t.matchId),
    matchLegUq: uniqueIndex("legs_match_leg_uq").on(t.matchId, t.legNumber),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type Leg = typeof legs.$inferSelect;
export type NewLeg = typeof legs.$inferInsert;
