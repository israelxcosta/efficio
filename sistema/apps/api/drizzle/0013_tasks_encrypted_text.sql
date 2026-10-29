-- 0013: task descriptions and comments encrypted per field (CWE-312; privacy policy §5: "observações"
-- are encrypted). The API now writes `tasks.description` and `task_comments.text` encrypted with the
-- workspace key (AES-256-GCM, AAD `workspace:table:column`, `v1.<iv>.<ct>` — modules/tasks/
-- encrypted-text.ts), and the encryption backfill (src/db/backfill.ts) encrypts the rows written before.
-- Titles stay in clear text (searched and listed). No new table, no grant change.
-- 1. The 1–5000 length CHECKs of 0011/0012 would refuse a ciphertext: 5000 characters of text become up
--    to ~20 thousand characters (~27 thousand for 4-byte characters). The size limit stays in the
--    contract (Zod); the database now checks the format — clear text is refused — and a ceiling of
--    28000 characters. NOT VALID: rows written before this migration stay clear text until the
--    backfill encrypts them (right after the migrations: `db:migrate` and the demo's boot); every row
--    inserted or updated from now on is checked.
-- 2. The backfill checks every workspace again (`encryption_backfilled_at` cleared; it skips values
--    already encrypted). All workspaces, because the table owner cannot see task rows (RLS is forced).
-- Runs inside the migrator's transaction; re-runnable (DROP … IF EXISTS before each constraint; a second
-- run only makes the backfill check again) and also on PGlite (no CONCURRENTLY).

-- 1. CHECKs: format and ceiling of the ciphertext --------------------------------------------------
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_description_chk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_description_chk" CHECK ("tasks"."description" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("tasks"."description") <= 28000) NOT VALID;
--> statement-breakpoint
ALTER TABLE "task_comments" DROP CONSTRAINT IF EXISTS "task_comments_text_chk";
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_text_chk" CHECK ("task_comments"."text" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_comments"."text") <= 28000) NOT VALID;
--> statement-breakpoint

-- 2. Encrypt what was written before: the backfill checks every workspace again --------------------
UPDATE "workspaces" SET "encryption_backfilled_at" = NULL WHERE "encryption_backfilled_at" IS NOT NULL;
