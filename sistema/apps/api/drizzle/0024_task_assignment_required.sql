-- 0024: every task has a responsible and a department (owner's rule: "não é para ter tarefa sem
-- departamento; toda tarefa deve estar alocada a uma pessoa e um departamento").
-- 1. Existing data is filled, workspace by workspace (FORCE RLS applies to the owner too):
--    - where a department is needed and none can be derived, a "Geral" department is created (reused
--      when one with that name exists);
--    - recurring tasks: department = the default responsible's, else "Geral"; default responsible = the
--      workspace owner when empty;
--    - open tasks without responsible: an occurrence takes its recurring task's default responsible
--      (`assignee_source = 'default'`), any other task the workspace owner (who routes it);
--    - tasks without department: the responsible's department, else (occurrences) the recurring task's,
--      else "Geral". Concluded/canceled tasks keep an empty responsible (history: they were never
--      assigned, or the member left — the FK clears it when a member is removed).
-- 2. Constraints: `tasks.department_id` NOT NULL; `tasks_open_assignee_chk` (an open task always has a
--    responsible — closed ones may lose it when the member leaves, ON DELETE SET NULL is kept for the
--    history and account deletion); `recurring_tasks.department_id` and `default_assignee_id` NOT NULL
--    (the API hands a member's recurring tasks to a replacement before removing them).
-- Runs inside the migrator's transaction; re-runnable (idempotent updates, DROP … IF EXISTS before each
-- constraint) and also on PGlite.

DO $$
DECLARE
  v_ws uuid;
  v_owner uuid;
  v_general uuid;
  v_previous text := current_setting('app.workspace_id', true);
BEGIN
  FOR v_ws IN SELECT w."id" FROM "public"."workspaces" w LOOP
    PERFORM set_config('app.workspace_id', v_ws::text, true);
    v_owner := NULL;
    v_general := NULL;
    SELECT m."user_id" INTO v_owner FROM "public"."workspace_members" m
     WHERE m."workspace_id" = v_ws AND m."role" = 'owner' LIMIT 1;

    -- Responsibles: recurring tasks without default → the owner; open occurrences without responsible →
    -- their recurring task's default; any other open task without responsible → the owner.
    IF v_owner IS NOT NULL THEN
      UPDATE "public"."recurring_tasks" r SET "default_assignee_id" = v_owner
       WHERE r."workspace_id" = v_ws AND r."default_assignee_id" IS NULL;
      UPDATE "public"."tasks" t SET "assignee_id" = r."default_assignee_id", "assignee_source" = 'default'
        FROM "public"."recurring_tasks" r
       WHERE t."workspace_id" = v_ws AND t."assignee_id" IS NULL
         AND t."status" IN ('todo', 'in_progress', 'waiting_client')
         AND r."workspace_id" = v_ws AND r."id" = t."recurring_task_id";
      UPDATE "public"."tasks" t SET "assignee_id" = v_owner
       WHERE t."workspace_id" = v_ws AND t."assignee_id" IS NULL
         AND t."status" IN ('todo', 'in_progress', 'waiting_client');
    END IF;

    -- Departments that can be derived: the default responsible's (recurring tasks), the responsible's
    -- (tasks), the recurring task's (occurrences).
    UPDATE "public"."recurring_tasks" r SET "department_id" = dm."department_id"
      FROM "public"."task_department_members" dm
     WHERE r."workspace_id" = v_ws AND r."department_id" IS NULL
       AND dm."workspace_id" = v_ws AND dm."user_id" = r."default_assignee_id";
    UPDATE "public"."tasks" t SET "department_id" = r."department_id"
      FROM "public"."recurring_tasks" r
     WHERE t."workspace_id" = v_ws AND t."department_id" IS NULL
       AND r."workspace_id" = v_ws AND r."id" = t."recurring_task_id" AND r."department_id" IS NOT NULL;
    UPDATE "public"."tasks" t SET "department_id" = dm."department_id"
      FROM "public"."task_department_members" dm
     WHERE t."workspace_id" = v_ws AND t."department_id" IS NULL AND t."recurring_task_id" IS NULL
       AND dm."workspace_id" = v_ws AND dm."user_id" = t."assignee_id";

    -- Whatever is left goes to "Geral" (created only when needed; an existing one is reused).
    IF EXISTS (SELECT 1 FROM "public"."recurring_tasks" r WHERE r."workspace_id" = v_ws AND r."department_id" IS NULL)
       OR EXISTS (SELECT 1 FROM "public"."tasks" t WHERE t."workspace_id" = v_ws AND t."department_id" IS NULL) THEN
      SELECT d."id" INTO v_general FROM "public"."task_departments" d
       WHERE d."workspace_id" = v_ws AND lower(d."name") = 'geral' LIMIT 1;
      IF v_general IS NULL THEN
        INSERT INTO "public"."task_departments" ("workspace_id", "name") VALUES (v_ws, 'Geral') RETURNING "id" INTO v_general;
      END IF;
      UPDATE "public"."recurring_tasks" r SET "department_id" = v_general
       WHERE r."workspace_id" = v_ws AND r."department_id" IS NULL;
      UPDATE "public"."tasks" t SET "department_id" = r."department_id"
        FROM "public"."recurring_tasks" r
       WHERE t."workspace_id" = v_ws AND t."department_id" IS NULL
         AND r."workspace_id" = v_ws AND r."id" = t."recurring_task_id";
      UPDATE "public"."tasks" t SET "department_id" = v_general
       WHERE t."workspace_id" = v_ws AND t."department_id" IS NULL;
    END IF;
  END LOOP;
  PERFORM set_config('app.workspace_id', coalesce(v_previous, ''), true);
END
$$;
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "department_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_open_assignee_chk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_open_assignee_chk" CHECK ("tasks"."assignee_id" is not null or "tasks"."status" in ('done', 'canceled'));
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ALTER COLUMN "department_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ALTER COLUMN "default_assignee_id" SET NOT NULL;
