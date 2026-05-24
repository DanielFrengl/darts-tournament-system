CREATE TYPE "public"."leg_status" AS ENUM('pending', 'live', 'finished');--> statement-breakpoint
CREATE TYPE "public"."match_phase" AS ENUM('group', 'quarter', 'semi', 'final', 'third_place');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('draft', 'groups', 'playoff', 'finished');--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" varchar(16) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"leg_number" integer NOT NULL,
	"winner_id" uuid,
	"status" "leg_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"phase" "match_phase" NOT NULL,
	"group_id" uuid,
	"bracket_round" integer,
	"bracket_position" integer,
	"player_a_id" uuid,
	"player_b_id" uuid,
	"best_of" integer NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"score_a" integer DEFAULT 0 NOT NULL,
	"score_b" integer DEFAULT 0 NOT NULL,
	"winner_id" uuid,
	"avg_a" numeric(6, 2),
	"avg_b" numeric(6, 2),
	"t20_a" integer,
	"t20_b" integer,
	"starts_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"avatar_url" text,
	"group_id" uuid,
	"seed" integer,
	"elo_rating" integer DEFAULT 1500 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" "tournament_status" DEFAULT 'draft' NOT NULL,
	"config_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legs" ADD CONSTRAINT "legs_winner_id_players_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_a_id_players_id_fk" FOREIGN KEY ("player_a_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_b_id_players_id_fk" FOREIGN KEY ("player_b_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_players_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groups_tournament_idx" ON "groups" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_tournament_name_uq" ON "groups" USING btree ("tournament_id","name");--> statement-breakpoint
CREATE INDEX "legs_match_idx" ON "legs" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legs_match_leg_uq" ON "legs" USING btree ("match_id","leg_number");--> statement-breakpoint
CREATE INDEX "matches_tournament_idx" ON "matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "matches_group_idx" ON "matches" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "players_tournament_idx" ON "players" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "players_group_idx" ON "players" USING btree ("group_id");