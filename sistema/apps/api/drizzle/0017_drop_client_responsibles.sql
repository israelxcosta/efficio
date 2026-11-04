-- 0017: the responsible per client and department ("carteira", `task_client_responsibles`) is removed —
-- the office decided it is not needed. The occurrences of a recurring task go to its default responsible
-- or, without one, wait in the department's queue.
-- 1. Occurrences that came from the client's responsible (`assignee_source = 'client'`):
--    - not started ("A fazer") from the current competence on (office time zone) follow the new rule: the
--      default responsible of the recurring task (`default`), else nobody;
--    - the others (earlier competences, in progress, concluded, canceled) keep the person, now as
--      assigned by hand (`manual`): nothing already worked on changes hands.
--    One workspace at a time (FORCE RLS applies to the table owner too).
-- 2. `tasks_occurrence_chk` no longer accepts `client`.
-- 3. The table goes (its policy, grants, indexes and foreign keys with it).
-- Runs inside the migrator's transaction; re-runnable (the update only touches rows still to do; DROP …
-- IF EXISTS before each constraint/table) and also on PGlite (no CONCURRENTLY).

DO $$
DECLARE
  ws uuid;
  current_competence constant text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
BEGIN
  FOR ws IN SELECT "id" FROM "public"."workspaces" LOOP
    PERFORM set_config('app.workspace_id', ws::text, true);
    UPDATE "public"."tasks" t
       SET "assignee_id" = r."default_assignee_id",
           "assignee_source" = CASE WHEN r."default_assignee_id" IS NULL THEN NULL ELSE 'default' END
      FROM "public"."recurring_tasks" r
     WHERE t."workspace_id" = ws
       AND r."workspace_id" = t."workspace_id"
       AND r."id" = t."recurring_task_id"
       AND t."assignee_source" = 'client'
       AND t."status" = 'todo'
       AND t."competence" >= current_competence;
    UPDATE "public"."tasks"
       SET "assignee_source" = 'manual'
     WHERE "workspace_id" = ws AND "assignee_source" = 'client';
  END LOOP;
  PERFORM set_config('app.workspace_id', '', true);
END
$$;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_occurrence_chk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_occurrence_chk" CHECK (("tasks"."recurring_task_id" is null and "tasks"."competence" is null and "tasks"."period_key" is null and "tasks"."reference_month" is null and "tasks"."target_date" is null and "tasks"."assignee_source" is null) or ("tasks"."recurring_task_id" is not null and "tasks"."client_id" is not null and "tasks"."due_date" is not null and "tasks"."target_date" is not null and "tasks"."target_date" <= "tasks"."due_date" and "tasks"."competence" is not null and "tasks"."competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "tasks"."reference_month" is not null and "tasks"."reference_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "tasks"."period_key" is not null and "tasks"."period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$' and ("tasks"."assignee_source" is null or "tasks"."assignee_source" in ('manual', 'default'))));
--> statement-breakpoint
DROP TABLE IF EXISTS "task_client_responsibles" CASCADE;
