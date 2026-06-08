-- Adds the "debug" role (superadmin) above "admin". Idempotent so it is
-- safe to re-run on databases where it may already exist.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'debug';
