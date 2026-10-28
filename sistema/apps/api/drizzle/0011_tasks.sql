-- 0011: task module, phase 1 (módulo Tarefas). Departments and the department of each member (at
-- most one), task categories, tasks with subtasks and comments, and the responsible member of each
-- client per department ("carteira"). Recurring work, flows, reports and notes come in later phases.
-- Same tenant pattern as 0004–0010: RLS forced with the workspace policy, composite foreign keys inside
-- the workspace, plain DML granted to effinance_app only. Members are referenced through
-- workspace_members (workspace_id, user_id): only members of the same workspace can be assigned, and
-- removing a member clears their assignments (`ON DELETE SET NULL (assignee_id)`, PostgreSQL 15+) and
-- removes their department membership and client responsibilities. Authorship (created, concluded,
-- commented by) points to users, with the name recorded at the time (`*_name`), so history survives
-- the person leaving. A client with tasks cannot be deleted (no cascade; the API answers 409).
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS before each
-- constraint/policy) and also on PGlite.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint

-- 1. Tables ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "task_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_departments_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_departments_name_chk" CHECK (length("task_departments"."name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_department_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_department_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'tag' NOT NULL,
	"color" text DEFAULT '#152B61' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_categories_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_categories_color_chk" CHECK ("task_categories"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client_id" uuid,
	"department_id" uuid,
	"category_id" uuid,
	"assignee_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"reopen_status" text,
	"start_date" date,
	"due_date" date,
	"start_time" text,
	"end_time" text,
	"created_by" uuid,
	"created_by_name" text NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"completed_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "tasks_title_chk" CHECK (length("tasks"."title") between 1 and 200),
	CONSTRAINT "tasks_status_chk" CHECK ("tasks"."status" in ('todo', 'in_progress', 'waiting_client', 'done', 'canceled')),
	CONSTRAINT "tasks_reopen_status_chk" CHECK ("tasks"."reopen_status" in ('todo', 'in_progress', 'waiting_client')),
	CONSTRAINT "tasks_priority_chk" CHECK ("tasks"."priority" in ('low', 'medium', 'high', 'urgent')),
	CONSTRAINT "tasks_time_chk" CHECK (("tasks"."start_time" is null or "tasks"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and ("tasks"."end_time" is null or ("tasks"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "tasks"."start_time" is not null and "tasks"."end_time" > "tasks"."start_time")) and ("tasks"."start_time" is null or "tasks"."due_date" is not null)),
	CONSTRAINT "tasks_dates_chk" CHECK ("tasks"."start_date" is null or "tasks"."due_date" is null or "tasks"."start_date" <= "tasks"."due_date"),
	CONSTRAINT "tasks_completion_chk" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" is not null) and ("tasks"."completed_at" is null or "tasks"."completed_by_name" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_subtasks_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_subtasks_title_chk" CHECK (length("task_subtasks"."title") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_comments_text_chk" CHECK (length("task_comments"."text") between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_client_responsibles" (
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_client_responsibles_pk" PRIMARY KEY("workspace_id","client_id","department_id")
);
--> statement-breakpoint

-- 2. Foreign keys (composite inside the workspace) --------------------------------------------------
ALTER TABLE "task_categories" DROP CONSTRAINT IF EXISTS "task_categories_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" DROP CONSTRAINT IF EXISTS "task_client_responsibles_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" ADD CONSTRAINT "task_client_responsibles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" DROP CONSTRAINT IF EXISTS "task_client_responsibles_client_fk";
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" ADD CONSTRAINT "task_client_responsibles_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" DROP CONSTRAINT IF EXISTS "task_client_responsibles_department_fk";
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" ADD CONSTRAINT "task_client_responsibles_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."task_departments"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" DROP CONSTRAINT IF EXISTS "task_client_responsibles_member_fk";
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" ADD CONSTRAINT "task_client_responsibles_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_comments" DROP CONSTRAINT IF EXISTS "task_comments_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_comments" DROP CONSTRAINT IF EXISTS "task_comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "task_comments" DROP CONSTRAINT IF EXISTS "task_comments_task_fk";
--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_department_members" DROP CONSTRAINT IF EXISTS "task_department_members_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_department_members" ADD CONSTRAINT "task_department_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_department_members" DROP CONSTRAINT IF EXISTS "task_department_members_member_fk";
--> statement-breakpoint
ALTER TABLE "task_department_members" ADD CONSTRAINT "task_department_members_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_department_members" DROP CONSTRAINT IF EXISTS "task_department_members_department_fk";
--> statement-breakpoint
ALTER TABLE "task_department_members" ADD CONSTRAINT "task_department_members_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."task_departments"("workspace_id","id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "task_departments" DROP CONSTRAINT IF EXISTS "task_departments_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_departments" ADD CONSTRAINT "task_departments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_subtasks" DROP CONSTRAINT IF EXISTS "task_subtasks_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_subtasks" DROP CONSTRAINT IF EXISTS "task_subtasks_task_fk";
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_completed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_client_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_department_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."task_departments"("workspace_id","id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_category_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."task_categories"("workspace_id","id") ON DELETE SET NULL ("category_id");
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_assignee_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE SET NULL ("assignee_id");
--> statement-breakpoint

-- 3. Indexes (every foreign key is backed by one) -------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "task_categories_name_uq" ON "task_categories" USING btree ("workspace_id",lower("name"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_client_responsibles_department_idx" ON "task_client_responsibles" USING btree ("workspace_id","department_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_client_responsibles_user_idx" ON "task_client_responsibles" USING btree ("workspace_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_task_idx" ON "task_comments" USING btree ("workspace_id","task_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_author_idx" ON "task_comments" USING btree ("author_id") WHERE "task_comments"."author_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_department_members_department_idx" ON "task_department_members" USING btree ("workspace_id","department_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_departments_name_uq" ON "task_departments" USING btree ("workspace_id",lower("name"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_subtasks_task_idx" ON "task_subtasks" USING btree ("workspace_id","task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_idx" ON "tasks" USING btree ("workspace_id","due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_idx" ON "tasks" USING btree ("workspace_id","assignee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_department_idx" ON "tasks" USING btree ("workspace_id","department_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_client_idx" ON "tasks" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_category_idx" ON "tasks" USING btree ("workspace_id","category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_created_by_idx" ON "tasks" USING btree ("created_by") WHERE "tasks"."created_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_completed_by_idx" ON "tasks" USING btree ("completed_by") WHERE "tasks"."completed_by" is not null;
--> statement-breakpoint

-- 4. Row Level Security and privileges ------------------------------------------------------------
ALTER TABLE "task_departments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_departments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_departments_tenant_isolation" ON "task_departments";
--> statement-breakpoint
CREATE POLICY "task_departments_tenant_isolation" ON "task_departments" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_departments" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_departments" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_departments" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_department_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_department_members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_department_members_tenant_isolation" ON "task_department_members";
--> statement-breakpoint
CREATE POLICY "task_department_members_tenant_isolation" ON "task_department_members" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_department_members" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_department_members" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_department_members" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_categories_tenant_isolation" ON "task_categories";
--> statement-breakpoint
CREATE POLICY "task_categories_tenant_isolation" ON "task_categories" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_categories" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_categories" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_categories" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tasks_tenant_isolation" ON "tasks";
--> statement-breakpoint
CREATE POLICY "tasks_tenant_isolation" ON "tasks" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "tasks" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "tasks" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tasks" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_subtasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_subtasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_subtasks_tenant_isolation" ON "task_subtasks";
--> statement-breakpoint
CREATE POLICY "task_subtasks_tenant_isolation" ON "task_subtasks" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_subtasks" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_subtasks" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_subtasks" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_comments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_comments_tenant_isolation" ON "task_comments";
--> statement-breakpoint
CREATE POLICY "task_comments_tenant_isolation" ON "task_comments" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_comments" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_comments" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_comments" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_client_responsibles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_client_responsibles_tenant_isolation" ON "task_client_responsibles";
--> statement-breakpoint
CREATE POLICY "task_client_responsibles_tenant_isolation" ON "task_client_responsibles" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_client_responsibles" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_client_responsibles" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_client_responsibles" TO effinance_app;
