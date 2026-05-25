ALTER TABLE "users" ALTER COLUMN "username" TYPE varchar(40);
ALTER TABLE "users" ADD COLUMN "first_name" varchar(60) DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN "last_name" varchar(60) DEFAULT '' NOT NULL;
-- Backfill existing rows so the UI doesn't render blank names for legacy accounts.
UPDATE "users" SET "first_name" = "username" WHERE "first_name" = '';
