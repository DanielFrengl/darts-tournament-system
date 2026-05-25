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

export const marketTypeEnum = pgEnum("market_type", [
  "match_winner",
  "correct_score",
  "leg_winner",
  "tournament_winner",
]);

export const marketScopeEnum = pgEnum("market_scope", ["match", "leg", "tournament"]);

export const marketStatusEnum = pgEnum("market_status", [
  "open",
  "closed",
  "settled",
  "cancelled",
]);

export const betStatusEnum = pgEnum("bet_status", [
  "open",
  "won",
  "lost",
  "refunded",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 40 }).notNull().unique(),
  firstName: varchar("first_name", { length: 60 }).notNull().default(""),
  lastName: varchar("last_name", { length: 60 }).notNull().default(""),
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
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
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
    userIdx: index("players_user_idx").on(t.userId),
    tournamentUserUq: uniqueIndex("players_tournament_user_uq").on(t.tournamentId, t.userId),
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

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }),
    legId: uuid("leg_id").references(() => legs.id, { onDelete: "cascade" }),
    type: marketTypeEnum("type").notNull(),
    scope: marketScopeEnum("scope").notNull(),
    status: marketStatusEnum("status").notNull().default("open"),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull().defaultNow(),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => ({
    matchIdx: index("markets_match_idx").on(t.matchId),
    legIdx: index("markets_leg_idx").on(t.legId),
    statusIdx: index("markets_status_idx").on(t.status),
  })
);

export const marketSelections = pgTable(
  "market_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }).notNull(),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    scoreA: integer("score_a"),
    scoreB: integer("score_b"),
    statOdds: numeric("stat_odds", { precision: 8, scale: 4 }).notNull(),
    pariOdds: numeric("pari_odds", { precision: 8, scale: 4 }),
    finalOdds: numeric("final_odds", { precision: 8, scale: 4 }).notNull(),
    isWinner: jsonb("is_winner").$type<boolean | null>(),
  },
  (t) => ({
    marketIdx: index("market_selections_market_idx").on(t.marketId),
  })
);

export const bets = pgTable(
  "bets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    selectionId: uuid("selection_id")
      .notNull()
      .references(() => marketSelections.id, { onDelete: "restrict" }),
    stake: numeric("stake", { precision: 12, scale: 2 }).notNull(),
    lockedOdds: numeric("locked_odds", { precision: 8, scale: 4 }).notNull(),
    status: betStatusEnum("status").notNull().default("open"),
    payout: numeric("payout", { precision: 12, scale: 2 }),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("bets_user_idx").on(t.userId),
    selectionIdx: index("bets_selection_idx").on(t.selectionId),
    statusIdx: index("bets_status_idx").on(t.status),
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

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  name: varchar("name", { length: 100 }).notNull().default("Jabloňová Open"),
  logoUrl: text("logo_url").notNull().default("/logo.png"),
  inviteCode: varchar("invite_code", { length: 64 }).notNull().default("darts"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;
export type MarketSelection = typeof marketSelections.$inferSelect;
export type NewMarketSelection = typeof marketSelections.$inferInsert;
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
