-- 0019: recurrence of any task ("toda tarefa pode ter recorrência"), on the engine of the recurring tasks.
-- A task with recurrence is a recurring task of origin `task` (its client, or internal) whose occurrences
-- are rows of `tasks` generated like the registry's (marker of 0018 included), listed as tasks and kept
-- out of the monthly audit. See docs/api.md → "Recorrência em qualquer tarefa".
-- 1. `recurring_tasks`: `origin` (`registry` | `task`, never changes), `internal` (no client: one occurrence
--    per period), the rule of a task's recurrence — `repeat_interval` ("a cada N" days/weeks/months),
--    `weekdays` (weekly on chosen weekdays), `start_date`/`end_date` (nominal dates, inclusive),
--    `occurrence_limit` ("após N vezes", the end date is computed from it) — and the priority and time of
--    the generated occurrences. Period `daily` and rule `skip` (no occurrence on a non-business day) join
--    the CHECKs; `recurring_tasks_origin_chk` keeps the registry rows free of the task-only features.
-- 2. `tasks.occurrence_origin`: the origin of the occurrence's series (null for non-occurrences), so lists
--    and the audit tell them apart in SQL; `tasks_recurring_origin_fk` (composite, to
--    `recurring_tasks (workspace_id, id, origin)`) keeps it equal to the series'. Existing occurrences are
--    the registry's (backfill per workspace: FORCE RLS applies to the table owner too). The occurrence
--    CHECK accepts occurrences without client only for origin `task`, and
--    `tasks_internal_occurrence_uq` (partial) gives them the uniqueness `tasks_occurrence_uq` gives the
--    others (NULL clients never conflict there).
-- 3. The generation trigger also watches the new rule columns.
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS before each
-- constraint/trigger, the backfill only touches rows still without origin) and also on PGlite (no
-- CONCURRENTLY).

-- 1. recurring_tasks ---------------------------------------------------------------------------------
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'registry' NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "internal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "repeat_interval" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "weekdays" integer[];
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "end_date" date;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "occurrence_limit" integer;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "start_time" text;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "end_time" text;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_period_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_period_chk" CHECK ("recurring_tasks"."period" in ('daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_rule_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_rule_chk" CHECK ("recurring_tasks"."non_business_day_rule" in ('anticipate', 'postpone', 'keep', 'skip'));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_schedule_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_schedule_chk" CHECK (("recurring_tasks"."period" = 'daily' and "recurring_tasks"."due_day" = 1 and "recurring_tasks"."due_month" is null and "recurring_tasks"."target_days_before" = 0 and "recurring_tasks"."reference_offset" = 0 and "recurring_tasks"."start_date" is not null) or ("recurring_tasks"."period" = 'weekly' and "recurring_tasks"."due_day" between 1 and 7 and "recurring_tasks"."due_month" is null and "recurring_tasks"."target_days_before" between 0 and 6 and "recurring_tasks"."reference_offset" = 0) or ("recurring_tasks"."period" = 'monthly' and "recurring_tasks"."due_day" between 1 and 31 and "recurring_tasks"."due_month" is null) or ("recurring_tasks"."period" in ('bimonthly', 'quarterly', 'semiannual', 'annual') and "recurring_tasks"."due_day" between 1 and 31 and "recurring_tasks"."due_month" is not null and "recurring_tasks"."due_month" between 1 and 12));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_recurrence_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_recurrence_chk" CHECK ("recurring_tasks"."repeat_interval" between 1 and 99 and ("recurring_tasks"."repeat_interval" = 1 or ("recurring_tasks"."period" in ('daily', 'weekly', 'monthly') and "recurring_tasks"."start_date" is not null)) and ("recurring_tasks"."weekdays" is null or ("recurring_tasks"."period" = 'weekly' and cardinality("recurring_tasks"."weekdays") between 1 and 7 and "recurring_tasks"."weekdays" <@ array[1, 2, 3, 4, 5, 6, 7])) and ("recurring_tasks"."non_business_day_rule" <> 'skip' or "recurring_tasks"."period" = 'daily' or ("recurring_tasks"."period" = 'weekly' and "recurring_tasks"."weekdays" is not null)) and ("recurring_tasks"."end_date" is null or ("recurring_tasks"."start_date" is not null and "recurring_tasks"."end_date" >= "recurring_tasks"."start_date")) and ("recurring_tasks"."occurrence_limit" is null or ("recurring_tasks"."occurrence_limit" between 1 and 500 and "recurring_tasks"."end_date" is not null)));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_origin_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_origin_chk" CHECK (("recurring_tasks"."origin" = 'registry' and not "recurring_tasks"."internal" and "recurring_tasks"."start_date" is null and "recurring_tasks"."end_date" is null and "recurring_tasks"."weekdays" is null and "recurring_tasks"."repeat_interval" = 1 and "recurring_tasks"."period" <> 'daily' and "recurring_tasks"."non_business_day_rule" <> 'skip') or ("recurring_tasks"."origin" = 'task' and cardinality("recurring_tasks"."regimes") = 0 and "recurring_tasks"."start_date" is not null));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_priority_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_priority_chk" CHECK ("recurring_tasks"."priority" in ('low', 'medium', 'high', 'urgent'));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_time_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_time_chk" CHECK (("recurring_tasks"."start_time" is null or "recurring_tasks"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and ("recurring_tasks"."end_time" is null or ("recurring_tasks"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "recurring_tasks"."start_time" is not null and "recurring_tasks"."end_time" > "recurring_tasks"."start_time")));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_workspace_id_id_origin_uq" CASCADE;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_workspace_id_id_origin_uq" UNIQUE("workspace_id","id","origin");
--> statement-breakpoint

-- 2. tasks.occurrence_origin -------------------------------------------------------------------------
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "occurrence_origin" text;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_occurrence_chk";
--> statement-breakpoint
DO $$
DECLARE
  ws uuid;
BEGIN
  FOR ws IN SELECT "id" FROM "public"."workspaces" LOOP
    PERFORM set_config('app.workspace_id', ws::text, true);
    UPDATE "public"."tasks"
       SET "occurrence_origin" = 'registry'
     WHERE "workspace_id" = ws AND "recurring_task_id" IS NOT NULL AND "occurrence_origin" IS NULL;
  END LOOP;
  PERFORM set_config('app.workspace_id', '', true);
END
$$;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_occurrence_chk" CHECK (("tasks"."recurring_task_id" is null and "tasks"."competence" is null and "tasks"."period_key" is null and "tasks"."reference_month" is null and "tasks"."target_date" is null and "tasks"."assignee_source" is null and "tasks"."occurrence_origin" is null) or ("tasks"."recurring_task_id" is not null and "tasks"."occurrence_origin" in ('registry', 'task') and ("tasks"."client_id" is not null or "tasks"."occurrence_origin" = 'task') and "tasks"."due_date" is not null and "tasks"."target_date" is not null and "tasks"."target_date" <= "tasks"."due_date" and "tasks"."competence" is not null and "tasks"."competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "tasks"."reference_month" is not null and "tasks"."reference_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "tasks"."period_key" is not null and "tasks"."period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$' and ("tasks"."assignee_source" is null or "tasks"."assignee_source" in ('manual', 'default'))));
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_recurring_origin_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurring_origin_fk" FOREIGN KEY ("workspace_id","recurring_task_id","occurrence_origin") REFERENCES "public"."recurring_tasks"("workspace_id","id","origin") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_internal_occurrence_uq" ON "tasks" USING btree ("workspace_id","recurring_task_id","period_key") WHERE "tasks"."recurring_task_id" is not null and "tasks"."client_id" is null;
--> statement-breakpoint

-- 3. Generation trigger: the rule columns of a task's recurrence decide occurrences too ---------------
DROP TRIGGER IF EXISTS "recurring_tasks_generation_bump" ON "recurring_tasks";
--> statement-breakpoint
CREATE TRIGGER "recurring_tasks_generation_bump" AFTER INSERT OR UPDATE OF "period", "due_day", "due_month", "target_days_before", "non_business_day_rule", "reference_offset", "regimes", "start_competence", "end_competence", "internal", "repeat_interval", "weekdays", "start_date", "end_date" ON "recurring_tasks" FOR EACH ROW
  EXECUTE FUNCTION "public"."task_generation_bump"();
