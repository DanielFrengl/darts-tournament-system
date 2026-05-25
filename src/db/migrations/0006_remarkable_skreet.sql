ALTER TABLE "players" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "players_user_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_tournament_user_uq" ON "players" USING btree ("tournament_id","user_id");