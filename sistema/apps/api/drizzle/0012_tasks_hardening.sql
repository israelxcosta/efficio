-- 0012: hardening of the task module (security review of 0011). No new table, no grant change.
-- 1. Partial indexes on the open tasks and on recent comments: the list ("Minhas", "Meu departamento"),
--    the start page and the activity read a small, hot slice instead of the whole history of the
--    workspace (an office accumulates closed tasks forever; every member can trigger these reads).
--    The predicate is spelled exactly like `OPEN_SQL` (modules/tasks/task-rows.ts) so the planner
--    matches it.
-- 2. CHECKs the contract already enforces (description, category name, recorded names), as the
--    second barrier.
-- 3. A task or a client responsibility can only point to a client, never to a supplier: the foreign
--    key to contacts carries `kind` (a generated column that is always 'client'). It also keeps a
--    client with tasks from becoming a supplier.
-- 4. LGPD: deleting an account (users row) clears the author ids of tasks and comments in every
--    workspace by `ON DELETE SET NULL`; the copies of the name recorded with them (`*_name`) are
--    replaced by a neutral label in the same statement, so the person's name does not outlive the
--    account in the offices it worked for (leaving a workspace keeps the name, as before).
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS, CREATE OR
-- REPLACE) and also on PGlite (no CONCURRENTLY).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint

-- 1. Indexes ----------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "tasks_open_assignee_idx" ON "tasks" USING btree ("workspace_id","assignee_id","due_date") WHERE "tasks"."status" in ('todo', 'in_progress', 'waiting_client');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_open_department_idx" ON "tasks" USING btree ("workspace_id","department_id","due_date") WHERE "tasks"."status" in ('todo', 'in_progress', 'waiting_client');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_recent_idx" ON "task_comments" USING btree ("workspace_id","created_at");
--> statement-breakpoint

-- 2. CHECKs -----------------------------------------------------------------------------------------
ALTER TABLE "task_categories" DROP CONSTRAINT IF EXISTS "task_categories_name_chk";
--> statement-breakpoint
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_name_chk" CHECK (length("task_categories"."name") between 1 and 60);
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_description_chk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_description_chk" CHECK (length("tasks"."description") between 1 and 5000);
--> statement-breakpoint
-- Copies of users.name (80 in the contract; users has no CHECK, hence the slack: a recorded name must
-- never stop a member from working). The label of section 4 fits.
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_people_names_chk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_people_names_chk" CHECK (length("tasks"."created_by_name") between 1 and 120 and length("tasks"."completed_by_name") between 1 and 120);
--> statement-breakpoint
ALTER TABLE "task_comments" DROP CONSTRAINT IF EXISTS "task_comments_author_name_chk";
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_name_chk" CHECK (length("task_comments"."author_name") between 1 and 120);
--> statement-breakpoint

-- 3. Only clients: the foreign key to contacts includes `kind` ---------------------------------------
-- Created only if missing: a re-run must not drop it from under the foreign keys below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.contacts'::regclass AND conname = 'contacts_workspace_id_id_kind_uq'
  ) THEN
    ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_id_kind_uq" UNIQUE("workspace_id","id","kind");
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "client_kind" text GENERATED ALWAYS AS ('client') STORED;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" ADD COLUMN IF NOT EXISTS "client_kind" text GENERATED ALWAYS AS ('client') STORED;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_client_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" DROP CONSTRAINT IF EXISTS "task_client_responsibles_client_fk";
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" ADD CONSTRAINT "task_client_responsibles_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE CASCADE;
--> statement-breakpoint

-- 4. LGPD: the recorded name goes with the account -------------------------------------------------
-- Only `users`' ON DELETE SET NULL clears these ids while keeping the name: the API never clears
-- `created_by`/`author_id`, and clears `completed_by` together with `completed_by_name` when a task
-- leaves `done` (left untouched here). The referential action runs as the table owner, so these
-- invoker-rights functions need no privilege; pinned search_path, not executable by PUBLIC.
CREATE OR REPLACE FUNCTION "public"."tasks_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD."created_by" IS NOT NULL AND NEW."created_by" IS NULL THEN
    NEW."created_by_name" := 'Usuário excluído';
  END IF;
  IF OLD."completed_by" IS NOT NULL AND NEW."completed_by" IS NULL
     AND NEW."completed_by_name" IS NOT NULL
     AND NEW."completed_by_name" IS NOT DISTINCT FROM OLD."completed_by_name" THEN
    NEW."completed_by_name" := 'Usuário excluído';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."tasks_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "tasks_forget_deleted_user" ON "tasks";
--> statement-breakpoint
CREATE TRIGGER "tasks_forget_deleted_user" BEFORE UPDATE OF "created_by", "completed_by" ON "tasks" FOR EACH ROW
  WHEN ((OLD."created_by" IS NOT NULL AND NEW."created_by" IS NULL) OR (OLD."completed_by" IS NOT NULL AND NEW."completed_by" IS NULL))
  EXECUTE FUNCTION "public"."tasks_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."task_comments_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."author_name" := 'Usuário excluído';
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_comments_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_comments_forget_deleted_user" ON "task_comments";
--> statement-breakpoint
CREATE TRIGGER "task_comments_forget_deleted_user" BEFORE UPDATE OF "author_id" ON "task_comments" FOR EACH ROW
  WHEN (OLD."author_id" IS NOT NULL AND NEW."author_id" IS NULL)
  EXECUTE FUNCTION "public"."task_comments_forget_deleted_user"();
