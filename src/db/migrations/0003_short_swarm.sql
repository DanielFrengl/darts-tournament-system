CREATE TYPE "public"."bet_status" AS ENUM('open', 'won', 'lost', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."market_scope" AS ENUM('match', 'leg');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('open', 'closed', 'settled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."market_type" AS ENUM('match_winner', 'correct_score', 'leg_winner');--> statement-breakpoint
CREATE TABLE "bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"selection_id" uuid NOT NULL,
	"stake" numeric(12, 2) NOT NULL,
	"locked_odds" numeric(8, 4) NOT NULL,
	"status" "bet_status" DEFAULT 'open' NOT NULL,
	"payout" numeric(12, 2),
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"label" varchar(80) NOT NULL,
	"player_id" uuid,
	"score_a" integer,
	"score_b" integer,
	"stat_odds" numeric(8, 4) NOT NULL,
	"pari_odds" numeric(8, 4),
	"final_odds" numeric(8, 4) NOT NULL,
	"is_winner" jsonb
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"match_id" uuid,
	"leg_id" uuid,
	"type" "market_type" NOT NULL,
	"scope" "market_scope" NOT NULL,
	"status" "market_status" DEFAULT 'open' NOT NULL,
	"opens_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_selection_id_market_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."market_selections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_selections" ADD CONSTRAINT "market_selections_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_selections" ADD CONSTRAINT "market_selections_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_leg_id_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_user_idx" ON "bets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bets_selection_idx" ON "bets" USING btree ("selection_id");--> statement-breakpoint
CREATE INDEX "bets_status_idx" ON "bets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "market_selections_market_idx" ON "market_selections" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "markets_match_idx" ON "markets" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "markets_leg_idx" ON "markets" USING btree ("leg_id");--> statement-breakpoint
CREATE INDEX "markets_status_idx" ON "markets" USING btree ("status");