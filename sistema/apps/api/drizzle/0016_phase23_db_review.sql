-- 0016: database review of phases 2 and 3 (migrations 0014/0015).
-- 1. LGPD (CWE-359): the history keeps the assignees of an "assigned" entry inside `task_events.data`
--    (`fromAssignee`/`toAssignee` = { id, name }), and nothing pseudonymized those names when the account
--    was deleted (0014 only replaced `actor_name`). Two columns now mirror those ids with a foreign key to
--    `users` `ON DELETE SET NULL`, filled by a trigger from `data` (the API keeps writing only `data`); when
--    the account goes, a `BEFORE UPDATE` trigger (as in 0012/0014) replaces that side of `data` by
--    { id: null, name: "Usuário excluído" } — in every workspace, also those the person had left (leaving
--    keeps the name, like the other recorded names). Existing rows are backfilled per workspace (the table
--    owner sees tenant rows only with `app.workspace_id`: FORCE RLS stays on); entries naming accounts
--    already deleted are pseudonymized now.
-- 2. Indexes for heavy reads: the calendar aggregates occurrences by target date (`target_date` had no
--    index: a scan of every occurrence of the workspace on each calendar request), and "quem viu" lists the
--    credential reveals of one client (a backward scan of the workspace's whole audit trail). The audit
--    index is not partial: postgres-js prepares statements and a generic plan cannot match `action = $n`
--    against a partial predicate.
-- 3. The contract template mirrors the contract in the database (0015 only had 500 blocks and a ceiling on
--    the JSON text): each block an object with only `type`/`text`/`rule`, the type and the rule from the
--    catalogs, at most 20 000 characters per block and 400 000 in total (`contract_blocks_valid`, IMMUTABLE,
--    invoker rights, pinned search_path, EXECUTE only for effinance_app, which writes the office).
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS before each
-- constraint/trigger, CREATE OR REPLACE, the backfill only touches rows still to do) and also on PGlite
-- (no CONCURRENTLY).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint

-- 1. LGPD: assignees named in the history ----------------------------------------------------------
ALTER TABLE "task_events" ADD COLUMN IF NOT EXISTS "from_assignee_id" uuid;
--> statement-breakpoint
ALTER TABLE "task_events" ADD COLUMN IF NOT EXISTS "to_assignee_id" uuid;
--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT IF EXISTS "task_events_from_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_from_assignee_id_users_id_fk" FOREIGN KEY ("from_assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT IF EXISTS "task_events_to_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_to_assignee_id_users_id_fk" FOREIGN KEY ("to_assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_events_from_assignee_idx" ON "task_events" USING btree ("from_assignee_id") WHERE "task_events"."from_assignee_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_events_to_assignee_idx" ON "task_events" USING btree ("to_assignee_id") WHERE "task_events"."to_assignee_id" is not null;
--> statement-breakpoint
-- The ids come from `data` (only strings shaped like a uuid; anything else is no reference).
CREATE OR REPLACE FUNCTION "public"."task_events_assignee_refs"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."from_assignee_id" := CASE
    WHEN jsonb_typeof(NEW."data" -> 'fromAssignee' -> 'id') = 'string'
     AND (NEW."data" -> 'fromAssignee' ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (NEW."data" -> 'fromAssignee' ->> 'id')::uuid END;
  NEW."to_assignee_id" := CASE
    WHEN jsonb_typeof(NEW."data" -> 'toAssignee' -> 'id') = 'string'
     AND (NEW."data" -> 'toAssignee' ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (NEW."data" -> 'toAssignee' ->> 'id')::uuid END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_events_assignee_refs"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_events_assignee_refs" ON "task_events";
--> statement-breakpoint
CREATE TRIGGER "task_events_assignee_refs" BEFORE INSERT OR UPDATE OF "data" ON "task_events" FOR EACH ROW
  EXECUTE FUNCTION "public"."task_events_assignee_refs"();
--> statement-breakpoint
-- The account went (ON DELETE SET NULL cleared the id): that side of `data` loses the name.
CREATE OR REPLACE FUNCTION "public"."task_events_forget_deleted_assignee"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD."from_assignee_id" IS NOT NULL AND NEW."from_assignee_id" IS NULL AND NEW."data" ? 'fromAssignee' THEN
    NEW."data" := jsonb_set(NEW."data", '{fromAssignee}', jsonb_build_object('id', NULL, 'name', 'Usuário excluído'));
  END IF;
  IF OLD."to_assignee_id" IS NOT NULL AND NEW."to_assignee_id" IS NULL AND NEW."data" ? 'toAssignee' THEN
    NEW."data" := jsonb_set(NEW."data", '{toAssignee}', jsonb_build_object('id', NULL, 'name', 'Usuário excluído'));
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_events_forget_deleted_assignee"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_events_forget_deleted_assignee" ON "task_events";
--> statement-breakpoint
CREATE TRIGGER "task_events_forget_deleted_assignee" BEFORE UPDATE OF "from_assignee_id", "to_assignee_id" ON "task_events" FOR EACH ROW
  WHEN ((OLD."from_assignee_id" IS NOT NULL AND NEW."from_assignee_id" IS NULL) OR (OLD."to_assignee_id" IS NOT NULL AND NEW."to_assignee_id" IS NULL))
  EXECUTE FUNCTION "public"."task_events_forget_deleted_assignee"();
--> statement-breakpoint
-- Backfill, one workspace at a time (FORCE RLS applies to the owner too). A side naming an account that no
-- longer exists is pseudonymized; the others get their id column from the trigger (UPDATE OF data).
DO $$
DECLARE
  ws uuid;
  previous text := current_setting('app.workspace_id', true);
  pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  deleted constant jsonb := jsonb_build_object('id', NULL, 'name', 'Usuário excluído');
BEGIN
  FOR ws IN SELECT "id" FROM "public"."workspaces" LOOP
    PERFORM set_config('app.workspace_id', ws::text, true);
    UPDATE "public"."task_events" e
       SET "data" = e."data"
         -- CASE guards the cast: only uuid-shaped ids are looked up.
         || CASE WHEN jsonb_typeof(e."data" -> 'fromAssignee' -> 'id') IS DISTINCT FROM 'string' THEN '{}'::jsonb
                 WHEN (e."data" -> 'fromAssignee' ->> 'id') !~* pattern THEN jsonb_build_object('fromAssignee', deleted)
                 WHEN EXISTS (SELECT 1 FROM "public"."users" u WHERE u."id" = (e."data" -> 'fromAssignee' ->> 'id')::uuid) THEN '{}'::jsonb
                 ELSE jsonb_build_object('fromAssignee', deleted) END
         || CASE WHEN jsonb_typeof(e."data" -> 'toAssignee' -> 'id') IS DISTINCT FROM 'string' THEN '{}'::jsonb
                 WHEN (e."data" -> 'toAssignee' ->> 'id') !~* pattern THEN jsonb_build_object('toAssignee', deleted)
                 WHEN EXISTS (SELECT 1 FROM "public"."users" u WHERE u."id" = (e."data" -> 'toAssignee' ->> 'id')::uuid) THEN '{}'::jsonb
                 ELSE jsonb_build_object('toAssignee', deleted) END
     WHERE e."workspace_id" = ws
       AND ((e."from_assignee_id" IS NULL AND jsonb_typeof(e."data" -> 'fromAssignee' -> 'id') = 'string')
         OR (e."to_assignee_id" IS NULL AND jsonb_typeof(e."data" -> 'toAssignee' -> 'id') = 'string'));
  END LOOP;
  PERFORM set_config('app.workspace_id', coalesce(previous, ''), true);
END
$$;
--> statement-breakpoint

-- 2. Indexes of the heavy reads ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "tasks_occurrence_target_idx" ON "tasks" USING btree ("workspace_id","target_date") WHERE "tasks"."recurring_task_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("workspace_id","entity_id","created_at");
--> statement-breakpoint

-- 3. The contract template mirrors the contract ------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."contract_blocks_valid"(blocks jsonb) RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT blocks IS NULL OR (
    jsonb_typeof(blocks) = 'array'
    AND jsonb_array_length(blocks) <= 500
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(blocks) AS b(v)
       WHERE CASE
               WHEN jsonb_typeof(b.v) <> 'object' THEN true
               ELSE (b.v - 'type' - 'text' - 'rule') <> '{}'::jsonb
                 OR jsonb_typeof(b.v -> 'type') IS DISTINCT FROM 'string'
                 OR (b.v ->> 'type') NOT IN ('title', 'subtitle', 'heading1', 'heading2', 'label', 'paragraph', 'paragraph_center', 'spacer')
                 OR (b.v ? 'text' AND (jsonb_typeof(b.v -> 'text') <> 'string' OR length(b.v ->> 'text') > 20000))
                 OR (b.v ? 'rule' AND (jsonb_typeof(b.v -> 'rule') <> 'string' OR (b.v ->> 'rule') NOT IN ('discount')))
             END
    )
    AND (SELECT coalesce(sum(length(b.v ->> 'text')), 0) FROM jsonb_array_elements(blocks) AS b(v) WHERE jsonb_typeof(b.v) = 'object') <= 400000
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."contract_blocks_valid"(jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."contract_blocks_valid"(jsonb) TO effinance_app;
--> statement-breakpoint
ALTER TABLE "offices" DROP CONSTRAINT IF EXISTS "offices_contract_blocks_chk";
--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_contract_blocks_chk" CHECK ("public"."contract_blocks_valid"("offices"."contract_blocks"));
