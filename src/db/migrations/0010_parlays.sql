CREATE TABLE "parlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stake" numeric(12, 2) NOT NULL,
	"locked_odds" numeric(10, 4) NOT NULL,
	"status" "bet_status" DEFAULT 'open' NOT NULL,
	"payout" numeric(12, 2),
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "parlays" ADD CONSTRAINT "parlays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parlays_user_idx" ON "parlays" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parlays_status_idx" ON "parlays" USING btree ("status");--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "parlay_id" uuid;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_parlay_id_parlays_id_fk" FOREIGN KEY ("parlay_id") REFERENCES "public"."parlays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bets_parlay_idx" ON "bets" USING btree ("parlay_id");
