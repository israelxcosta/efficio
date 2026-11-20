-- 0027: database security review, second part.
-- 1. Notes encrypted by the API (transactions.notes, goals.notes, goal_contributions.note and the notes of
--    a series template, recurrences.template->>'notes') must be `v1.<iv>.<ct>` or empty, never clear text.
--    NOT VALID, like 0013/0026: new writes are checked right away; rows written before field encryption
--    are encrypted by the backfill that `db:migrate` (and the demo's boot) runs after the migrations —
--    every workspace is marked for it again below. After it, VALIDATE (docs/deploy-aws.md).
-- 2. The public onboarding policy (0025) shows a link only while it can be used: not revoked and not
--    expired. A leaked or revoked token no longer reveals the workspace/link ids nor opens a tenant
--    transaction (the route already answered the same 404).
-- Runs inside the migrator's transaction; re-runnable (DROP … IF EXISTS first) and also on PGlite.
ALTER TABLE "goal_contributions" DROP CONSTRAINT IF EXISTS "goal_contributions_note_chk";
--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_note_chk" CHECK (("goal_contributions"."note" = '' or "goal_contributions"."note" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT IF EXISTS "goals_notes_chk";
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_notes_chk" CHECK (("goals"."notes" = '' or "goals"."notes" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "recurrences" DROP CONSTRAINT IF EXISTS "recurrences_template_notes_chk";
--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_template_notes_chk" CHECK ((("recurrences"."template" ->> 'notes') = '' or ("recurrences"."template" ->> 'notes') ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_notes_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_notes_chk" CHECK (("transactions"."notes" = '' or "transactions"."notes" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$')) NOT VALID;
--> statement-breakpoint
DROP POLICY IF EXISTS "onboarding_links_public_token" ON "onboarding_links";
--> statement-breakpoint
CREATE POLICY "onboarding_links_public_token" ON "onboarding_links" AS PERMISSIVE FOR SELECT TO effinance_app USING ("token_hash" = nullif(current_setting('app.onboarding_token', true), '') AND "revoked_at" IS NULL AND "expires_at" > now());
--> statement-breakpoint
UPDATE "workspaces" SET "encryption_backfilled_at" = NULL;
