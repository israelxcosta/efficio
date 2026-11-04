-- 0018: generation marker of the recurring occurrences, regime groups and the report's productivity index.
-- 1. Generation marker (review risk "leitura cara"): every read of a competence used to recompute the
--    occurrences of the window (all clients × recurring tasks, plus a scan of the existing rows).
--    - `task_generation_state` holds one version per workspace, bumped by triggers whenever something that
--      decides which occurrences exist changes: a recurring task (insert; update of its schedule, regimes
--      or competences), its client links
--      (insert/update; a statement trigger with a transition table), a client's kind, regime, contract
--      start, status or inactivation date (insert/update). Deletes do not bump: a deleted client or link
--      only shrinks what should exist (the generation only inserts), and a cascade from a deleted
--      workspace must not write a row pointing to it.
--    - `task_generation_marks` says "recurring task × competence generated with version N (and the code's
--      rules R)"; `ensureOccurrences` reads the version before the data and skips the current pairs.
--    Both are tenant tables: RLS ENABLE + FORCE with the usual policy, plain DML for effinance_app, the
--    marks with a composite foreign key to the recurring task (cascade).
-- 2. Regime groups: `recurring_tasks.catalog_key` (the catalog item a recurring task came from), unique
--    per workspace, so applying a group again finds it instead of creating a twin.
-- 3. The productivity of the task report filters conclusions by a range of `completed_at`: partial index
--    `(workspace_id, completed_at) WHERE status = 'done'`.
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS before each
-- constraint/trigger/policy, CREATE OR REPLACE) and also on PGlite (no CONCURRENTLY).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint

-- 1. Generation marker ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "task_generation_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_generation_marks" (
	"workspace_id" uuid NOT NULL,
	"recurring_task_id" uuid NOT NULL,
	"competence" text NOT NULL,
	"version" bigint NOT NULL,
	"rules" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_generation_marks_pk" PRIMARY KEY("workspace_id","recurring_task_id","competence")
);
--> statement-breakpoint
ALTER TABLE "task_generation_marks" DROP CONSTRAINT IF EXISTS "task_generation_marks_competence_chk";
--> statement-breakpoint
ALTER TABLE "task_generation_marks" ADD CONSTRAINT "task_generation_marks_competence_chk" CHECK ("task_generation_marks"."competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
--> statement-breakpoint
ALTER TABLE "task_generation_state" DROP CONSTRAINT IF EXISTS "task_generation_state_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_generation_state" ADD CONSTRAINT "task_generation_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_generation_marks" DROP CONSTRAINT IF EXISTS "task_generation_marks_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_generation_marks" ADD CONSTRAINT "task_generation_marks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_generation_marks" DROP CONSTRAINT IF EXISTS "task_generation_marks_recurring_fk";
--> statement-breakpoint
ALTER TABLE "task_generation_marks" ADD CONSTRAINT "task_generation_marks_recurring_fk" FOREIGN KEY ("workspace_id","recurring_task_id") REFERENCES "public"."recurring_tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_generation_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_generation_state" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_generation_state_tenant_isolation" ON "task_generation_state";
--> statement-breakpoint
CREATE POLICY "task_generation_state_tenant_isolation" ON "task_generation_state" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_generation_state" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_generation_state" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_generation_state" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_generation_marks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_generation_marks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_generation_marks_tenant_isolation" ON "task_generation_marks";
--> statement-breakpoint
CREATE POLICY "task_generation_marks_tenant_isolation" ON "task_generation_marks" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_generation_marks" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_generation_marks" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_generation_marks" TO effinance_app;
--> statement-breakpoint
-- Row triggers (recurring tasks, clients): bump the version of the row's workspace. Invoker rights: the
-- caller's RLS applies (a row of its own workspace is what it may write).
CREATE OR REPLACE FUNCTION "public"."task_generation_bump"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO "public"."task_generation_state" AS s ("workspace_id", "version") VALUES (NEW."workspace_id", 1)
  ON CONFLICT ("workspace_id") DO UPDATE SET "version" = s."version" + 1, "updated_at" = now();
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_generation_bump"() FROM PUBLIC;
--> statement-breakpoint
-- Statement triggers with a transition table (client links are written in batches of up to 1000 rows).
CREATE OR REPLACE FUNCTION "public"."task_generation_bump_links"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO "public"."task_generation_state" AS s ("workspace_id", "version")
  SELECT DISTINCT c."workspace_id", 1 FROM changed c
  ON CONFLICT ("workspace_id") DO UPDATE SET "version" = s."version" + 1, "updated_at" = now();
  RETURN NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_generation_bump_links"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "recurring_tasks_generation_bump" ON "recurring_tasks";
--> statement-breakpoint
-- Only the columns that decide which occurrences exist: an `ON DELETE SET NULL` of the creator or the
-- default responsible (account deletion, member removal) runs outside any workspace and must not write.
CREATE TRIGGER "recurring_tasks_generation_bump" AFTER INSERT OR UPDATE OF "period", "due_day", "due_month", "target_days_before", "non_business_day_rule", "reference_offset", "regimes", "start_competence", "end_competence" ON "recurring_tasks" FOR EACH ROW
  EXECUTE FUNCTION "public"."task_generation_bump"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "recurring_task_clients_generation_bump_insert" ON "recurring_task_clients";
--> statement-breakpoint
CREATE TRIGGER "recurring_task_clients_generation_bump_insert" AFTER INSERT ON "recurring_task_clients"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
  EXECUTE FUNCTION "public"."task_generation_bump_links"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "recurring_task_clients_generation_bump_update" ON "recurring_task_clients";
--> statement-breakpoint
CREATE TRIGGER "recurring_task_clients_generation_bump_update" AFTER UPDATE ON "recurring_task_clients"
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
  EXECUTE FUNCTION "public"."task_generation_bump_links"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "contacts_generation_bump_insert" ON "contacts";
--> statement-breakpoint
CREATE TRIGGER "contacts_generation_bump_insert" AFTER INSERT ON "contacts" FOR EACH ROW
  WHEN (NEW."kind" = 'client')
  EXECUTE FUNCTION "public"."task_generation_bump"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "contacts_generation_bump_update" ON "contacts";
--> statement-breakpoint
CREATE TRIGGER "contacts_generation_bump_update" AFTER UPDATE ON "contacts" FOR EACH ROW
  WHEN (OLD."kind" IS DISTINCT FROM NEW."kind"
     OR OLD."tax_regime" IS DISTINCT FROM NEW."tax_regime"
     OR OLD."contract_start_date" IS DISTINCT FROM NEW."contract_start_date"
     OR OLD."status" IS DISTINCT FROM NEW."status"
     OR OLD."inactivated_at" IS DISTINCT FROM NEW."inactivated_at")
  EXECUTE FUNCTION "public"."task_generation_bump"();
--> statement-breakpoint

-- 2. Regime groups ----------------------------------------------------------------------------------
ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "catalog_key" text;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_catalog_key_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_catalog_key_chk" CHECK ("recurring_tasks"."catalog_key" is null or "recurring_tasks"."catalog_key" ~ '^[a-z0-9_]{1,60}$');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recurring_tasks_catalog_key_uq" ON "recurring_tasks" USING btree ("workspace_id","catalog_key") WHERE "recurring_tasks"."catalog_key" is not null;
--> statement-breakpoint

-- 3. Productivity of the report ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "tasks_completed_idx" ON "tasks" USING btree ("workspace_id","completed_at") WHERE "tasks"."status" = 'done';
