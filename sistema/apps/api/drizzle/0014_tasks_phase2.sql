-- 0014: task module, phase 2 (porte do Effy): recurring tasks and their occurrences, processes and
-- templates, the history of each task, attachments and personal notes.
-- 1. recurring_tasks (Effy's ObligationDef) and recurring_task_clients (clients chosen by hand and the
--    exceptions of the regimes). The occurrences are rows of `tasks` (one per recurring task, client and
--    period: `tasks_occurrence_uq`, the ON CONFLICT target of the idempotent generation) with the
--    competence (month of the legal deadline), the period (the competence, or the Monday of a weekly
--    occurrence), the reference month, the internal target (`target_date`; the legal deadline is
--    `due_date`) and where the responsible came from (`assignee_source`). Standalone tasks keep those
--    columns null (`tasks_occurrence_chk`).
-- 2. task_flow_templates/_steps and task_flows/_steps (Effy's TaskFlow*): a template has relative
--    deadlines and no client; a process copies it; only the active step has a task (`task_id`, unique).
-- 3. task_events: the task history ("linha do tempo"); free text (reasons, file names) encrypted.
-- 4. task_attachments: the file in the database (bytea), encrypted with the workspace key (12-byte IV +
--    ciphertext + 16-byte tag: `size_chk`), name encrypted, type from an allowlist; 10 MB per file.
-- 5. task_notes: personal notes, private to the member (cascade when the member leaves), encrypted.
-- Same tenant pattern as 0004–0013: RLS forced with the workspace policy, composite foreign keys inside
-- the workspace (`ON DELETE SET NULL (column)` clears only the reference, PostgreSQL 15+), an index for
-- every foreign key, plain DML granted to effinance_app only. Encrypted columns accept only the
-- `v1.<iv>.<ct>` format (no clear text). Authorship names follow 0012: deleting the account replaces the
-- recorded name with "Usuário excluído" (LGPD). New tables only hold data written encrypted by the API:
-- no backfill needed.
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS before each
-- constraint/policy/trigger, CREATE OR REPLACE) and also on PGlite (no CONCURRENTLY).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint

-- 1. Tables and the new columns of tasks ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "recurring_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"department_id" uuid,
	"category_id" uuid,
	"default_assignee_id" uuid,
	"period" text DEFAULT 'monthly' NOT NULL,
	"due_day" integer NOT NULL,
	"due_month" integer,
	"target_days_before" integer DEFAULT 0 NOT NULL,
	"non_business_day_rule" text DEFAULT 'anticipate' NOT NULL,
	"reference_offset" integer DEFAULT 1 NOT NULL,
	"regimes" text[] DEFAULT '{}'::text[] NOT NULL,
	"start_competence" text NOT NULL,
	"end_competence" text,
	"created_by" uuid,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_tasks_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "recurring_tasks_name_chk" CHECK (length("recurring_tasks"."name") between 1 and 200),
	CONSTRAINT "recurring_tasks_created_by_name_chk" CHECK (length("recurring_tasks"."created_by_name") between 1 and 120),
	CONSTRAINT "recurring_tasks_description_chk" CHECK ("recurring_tasks"."description" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("recurring_tasks"."description") <= 28000),
	CONSTRAINT "recurring_tasks_period_chk" CHECK ("recurring_tasks"."period" in ('weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual')),
	CONSTRAINT "recurring_tasks_rule_chk" CHECK ("recurring_tasks"."non_business_day_rule" in ('anticipate', 'postpone', 'keep')),
	CONSTRAINT "recurring_tasks_schedule_chk" CHECK (("recurring_tasks"."period" = 'weekly' and "recurring_tasks"."due_day" between 1 and 7 and "recurring_tasks"."due_month" is null and "recurring_tasks"."target_days_before" between 0 and 6 and "recurring_tasks"."reference_offset" = 0) or ("recurring_tasks"."period" = 'monthly' and "recurring_tasks"."due_day" between 1 and 31 and "recurring_tasks"."due_month" is null) or ("recurring_tasks"."period" in ('bimonthly', 'quarterly', 'semiannual', 'annual') and "recurring_tasks"."due_day" between 1 and 31 and "recurring_tasks"."due_month" is not null and "recurring_tasks"."due_month" between 1 and 12)),
	CONSTRAINT "recurring_tasks_target_chk" CHECK ("recurring_tasks"."target_days_before" between 0 and 30),
	CONSTRAINT "recurring_tasks_reference_chk" CHECK ("recurring_tasks"."reference_offset" between 0 and 12),
	CONSTRAINT "recurring_tasks_regimes_chk" CHECK ("recurring_tasks"."regimes" <@ array['simples_nacional', 'mei', 'presumed_profit', 'real_profit', 'exempt', 'other']::text[] and cardinality("recurring_tasks"."regimes") <= 6),
	CONSTRAINT "recurring_tasks_competence_chk" CHECK ("recurring_tasks"."start_competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and ("recurring_tasks"."end_competence" is null or ("recurring_tasks"."end_competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "recurring_tasks"."end_competence" >= "recurring_tasks"."start_competence")))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_task_clients" (
	"workspace_id" uuid NOT NULL,
	"recurring_task_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"client_kind" text GENERATED ALWAYS AS ('client') STORED,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_task_clients_pk" PRIMARY KEY("workspace_id","recurring_task_id","client_id"),
	CONSTRAINT "recurring_task_clients_mode_chk" CHECK ("recurring_task_clients"."mode" in ('include', 'exclude'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_flow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_flow_templates_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_flow_templates_title_chk" CHECK (length("task_flow_templates"."title") between 1 and 200),
	CONSTRAINT "task_flow_templates_created_by_name_chk" CHECK (length("task_flow_templates"."created_by_name") between 1 and 120),
	CONSTRAINT "task_flow_templates_description_chk" CHECK ("task_flow_templates"."description" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_flow_templates"."description") <= 28000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_flow_template_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"department_id" uuid,
	"category_id" uuid,
	"assignee_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"relative_days" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_flow_template_steps_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_flow_template_steps_position_uq" UNIQUE("workspace_id","template_id","position"),
	CONSTRAINT "task_flow_template_steps_title_chk" CHECK (length("task_flow_template_steps"."title") between 1 and 200),
	CONSTRAINT "task_flow_template_steps_position_chk" CHECK ("task_flow_template_steps"."position" between 1 and 30),
	CONSTRAINT "task_flow_template_steps_days_chk" CHECK ("task_flow_template_steps"."relative_days" between 0 and 365),
	CONSTRAINT "task_flow_template_steps_priority_chk" CHECK ("task_flow_template_steps"."priority" in ('low', 'medium', 'high', 'urgent')),
	CONSTRAINT "task_flow_template_steps_description_chk" CHECK ("task_flow_template_steps"."description" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_flow_template_steps"."description") <= 28000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"client_id" uuid,
	"client_kind" text GENERATED ALWAYS AS ('client') STORED,
	"template_id" uuid,
	"created_by" uuid,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_flows_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_flows_title_chk" CHECK (length("task_flows"."title") between 1 and 200),
	CONSTRAINT "task_flows_created_by_name_chk" CHECK (length("task_flows"."created_by_name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_flow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client_id" uuid,
	"client_kind" text GENERATED ALWAYS AS ('client') STORED,
	"department_id" uuid,
	"category_id" uuid,
	"assignee_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"relative_days" integer,
	"task_id" uuid,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "task_flow_steps_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_flow_steps_position_uq" UNIQUE("workspace_id","flow_id","position"),
	CONSTRAINT "task_flow_steps_task_uq" UNIQUE("workspace_id","task_id"),
	CONSTRAINT "task_flow_steps_title_chk" CHECK (length("task_flow_steps"."title") between 1 and 200),
	CONSTRAINT "task_flow_steps_position_chk" CHECK ("task_flow_steps"."position" between 1 and 30),
	CONSTRAINT "task_flow_steps_days_chk" CHECK ("task_flow_steps"."relative_days" is null or "task_flow_steps"."relative_days" between 0 and 365),
	CONSTRAINT "task_flow_steps_priority_chk" CHECK ("task_flow_steps"."priority" in ('low', 'medium', 'high', 'urgent')),
	CONSTRAINT "task_flow_steps_activation_chk" CHECK (("task_flow_steps"."task_id" is null or "task_flow_steps"."activated_at" is not null) and ("task_flow_steps"."completed_at" is null or "task_flow_steps"."activated_at" is not null)),
	CONSTRAINT "task_flow_steps_description_chk" CHECK ("task_flow_steps"."description" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_flow_steps"."description") <= 28000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_events_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_events_kind_chk" CHECK ("task_events"."kind" in ('created', 'updated', 'assigned', 'status', 'reopened', 'commented', 'comment_removed', 'attachment_added', 'attachment_removed', 'flow_step')),
	CONSTRAINT "task_events_actor_name_chk" CHECK (length("task_events"."actor_name") between 1 and 120),
	CONSTRAINT "task_events_data_chk" CHECK (jsonb_typeof("task_events"."data") = 'object' and length("task_events"."data"::text) <= 4000),
	CONSTRAINT "task_events_note_chk" CHECK ("task_events"."note" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_events"."note") <= 28000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" bytea NOT NULL,
	"uploaded_by" uuid,
	"uploaded_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_attachments_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_attachments_file_name_chk" CHECK ("task_attachments"."file_name" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_attachments"."file_name") <= 2000),
	CONSTRAINT "task_attachments_type_chk" CHECK ("task_attachments"."content_type" in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'text/plain', 'text/csv', 'application/zip')),
	CONSTRAINT "task_attachments_size_chk" CHECK ("task_attachments"."size_bytes" between 1 and 10485760 and octet_length("task_attachments"."content") = "task_attachments"."size_bytes" + 28),
	CONSTRAINT "task_attachments_uploaded_by_name_chk" CHECK (length("task_attachments"."uploaded_by_name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_notes_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_notes_title_chk" CHECK ("task_notes"."title" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_notes"."title") <= 2000),
	CONSTRAINT "task_notes_content_chk" CHECK ("task_notes"."content" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("task_notes"."content") <= 81000)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurring_task_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "competence" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "period_key" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reference_month" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "target_date" date;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignee_source" text;
--> statement-breakpoint

-- 2. Foreign keys (composite inside the workspace) and the occurrence constraints of tasks ------
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_schedule_chk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_schedule_chk" CHECK (("recurring_tasks"."period" = 'weekly' and "recurring_tasks"."due_day" between 1 and 7 and "recurring_tasks"."due_month" is null and "recurring_tasks"."target_days_before" between 0 and 6 and "recurring_tasks"."reference_offset" = 0) or ("recurring_tasks"."period" = 'monthly' and "recurring_tasks"."due_day" between 1 and 31 and "recurring_tasks"."due_month" is null) or ("recurring_tasks"."period" in ('bimonthly', 'quarterly', 'semiannual', 'annual') and "recurring_tasks"."due_day" between 1 and 31 and "recurring_tasks"."due_month" is not null and "recurring_tasks"."due_month" between 1 and 12));
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" DROP CONSTRAINT IF EXISTS "recurring_task_clients_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" ADD CONSTRAINT "recurring_task_clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" DROP CONSTRAINT IF EXISTS "recurring_task_clients_task_fk";
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" ADD CONSTRAINT "recurring_task_clients_task_fk" FOREIGN KEY ("workspace_id","recurring_task_id") REFERENCES "public"."recurring_tasks"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" DROP CONSTRAINT IF EXISTS "recurring_task_clients_client_fk";
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" ADD CONSTRAINT "recurring_task_clients_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_department_fk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."task_departments"("workspace_id","id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_category_fk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."task_categories"("workspace_id","id") ON DELETE SET NULL ("category_id");
--> statement-breakpoint
ALTER TABLE "recurring_tasks" DROP CONSTRAINT IF EXISTS "recurring_tasks_assignee_fk";
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_assignee_fk" FOREIGN KEY ("workspace_id","default_assignee_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE SET NULL ("default_assignee_id");
--> statement-breakpoint
ALTER TABLE "task_attachments" DROP CONSTRAINT IF EXISTS "task_attachments_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_attachments" DROP CONSTRAINT IF EXISTS "task_attachments_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "task_attachments" DROP CONSTRAINT IF EXISTS "task_attachments_task_fk";
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT IF EXISTS "task_events_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT IF EXISTS "task_events_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT IF EXISTS "task_events_task_fk";
--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_flow_steps" DROP CONSTRAINT IF EXISTS "task_flow_steps_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ADD CONSTRAINT "task_flow_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_flow_steps" DROP CONSTRAINT IF EXISTS "task_flow_steps_flow_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ADD CONSTRAINT "task_flow_steps_flow_fk" FOREIGN KEY ("workspace_id","flow_id") REFERENCES "public"."task_flows"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_flow_steps" DROP CONSTRAINT IF EXISTS "task_flow_steps_client_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ADD CONSTRAINT "task_flow_steps_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "task_flow_steps" DROP CONSTRAINT IF EXISTS "task_flow_steps_department_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ADD CONSTRAINT "task_flow_steps_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."task_departments"("workspace_id","id") ON DELETE SET NULL ("department_id");
--> statement-breakpoint
ALTER TABLE "task_flow_steps" DROP CONSTRAINT IF EXISTS "task_flow_steps_category_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ADD CONSTRAINT "task_flow_steps_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."task_categories"("workspace_id","id") ON DELETE SET NULL ("category_id");
--> statement-breakpoint
ALTER TABLE "task_flow_steps" DROP CONSTRAINT IF EXISTS "task_flow_steps_assignee_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ADD CONSTRAINT "task_flow_steps_assignee_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE SET NULL ("assignee_id");
--> statement-breakpoint
ALTER TABLE "task_flow_steps" DROP CONSTRAINT IF EXISTS "task_flow_steps_task_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ADD CONSTRAINT "task_flow_steps_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE SET NULL ("task_id");
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" DROP CONSTRAINT IF EXISTS "task_flow_template_steps_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" ADD CONSTRAINT "task_flow_template_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" DROP CONSTRAINT IF EXISTS "task_flow_template_steps_template_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" ADD CONSTRAINT "task_flow_template_steps_template_fk" FOREIGN KEY ("workspace_id","template_id") REFERENCES "public"."task_flow_templates"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" DROP CONSTRAINT IF EXISTS "task_flow_template_steps_department_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" ADD CONSTRAINT "task_flow_template_steps_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."task_departments"("workspace_id","id") ON DELETE SET NULL ("department_id");
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" DROP CONSTRAINT IF EXISTS "task_flow_template_steps_category_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" ADD CONSTRAINT "task_flow_template_steps_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."task_categories"("workspace_id","id") ON DELETE SET NULL ("category_id");
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" DROP CONSTRAINT IF EXISTS "task_flow_template_steps_assignee_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" ADD CONSTRAINT "task_flow_template_steps_assignee_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE SET NULL ("assignee_id");
--> statement-breakpoint
ALTER TABLE "task_flow_templates" DROP CONSTRAINT IF EXISTS "task_flow_templates_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_templates" ADD CONSTRAINT "task_flow_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_flow_templates" DROP CONSTRAINT IF EXISTS "task_flow_templates_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_flow_templates" ADD CONSTRAINT "task_flow_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "task_flows" DROP CONSTRAINT IF EXISTS "task_flows_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_flows" ADD CONSTRAINT "task_flows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_flows" DROP CONSTRAINT IF EXISTS "task_flows_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_flows" ADD CONSTRAINT "task_flows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "task_flows" DROP CONSTRAINT IF EXISTS "task_flows_client_fk";
--> statement-breakpoint
ALTER TABLE "task_flows" ADD CONSTRAINT "task_flows_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "task_flows" DROP CONSTRAINT IF EXISTS "task_flows_template_fk";
--> statement-breakpoint
ALTER TABLE "task_flows" ADD CONSTRAINT "task_flows_template_fk" FOREIGN KEY ("workspace_id","template_id") REFERENCES "public"."task_flow_templates"("workspace_id","id") ON DELETE SET NULL ("template_id");
--> statement-breakpoint
ALTER TABLE "task_notes" DROP CONSTRAINT IF EXISTS "task_notes_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task_notes" DROP CONSTRAINT IF EXISTS "task_notes_member_fk";
--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_member_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_recurring_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurring_fk" FOREIGN KEY ("workspace_id","recurring_task_id") REFERENCES "public"."recurring_tasks"("workspace_id","id") ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_occurrence_uq";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_occurrence_uq" UNIQUE("workspace_id","recurring_task_id","client_id","period_key");
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_occurrence_chk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_occurrence_chk" CHECK (("tasks"."recurring_task_id" is null and "tasks"."competence" is null and "tasks"."period_key" is null and "tasks"."reference_month" is null and "tasks"."target_date" is null and "tasks"."assignee_source" is null) or ("tasks"."recurring_task_id" is not null and "tasks"."client_id" is not null and "tasks"."due_date" is not null and "tasks"."target_date" is not null and "tasks"."target_date" <= "tasks"."due_date" and "tasks"."competence" is not null and "tasks"."competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "tasks"."reference_month" is not null and "tasks"."reference_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "tasks"."period_key" is not null and "tasks"."period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$' and ("tasks"."assignee_source" is null or "tasks"."assignee_source" in ('manual', 'client', 'default'))));
--> statement-breakpoint

-- 3. Indexes (every foreign key is backed by one) -------------------------------------------------
CREATE INDEX IF NOT EXISTS "recurring_task_clients_client_idx" ON "recurring_task_clients" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_department_idx" ON "recurring_tasks" USING btree ("workspace_id","department_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_category_idx" ON "recurring_tasks" USING btree ("workspace_id","category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_assignee_idx" ON "recurring_tasks" USING btree ("workspace_id","default_assignee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_tasks_created_by_idx" ON "recurring_tasks" USING btree ("created_by") WHERE "recurring_tasks"."created_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_task_idx" ON "task_attachments" USING btree ("workspace_id","task_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachments_uploaded_by_idx" ON "task_attachments" USING btree ("uploaded_by") WHERE "task_attachments"."uploaded_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_events_task_idx" ON "task_events" USING btree ("workspace_id","task_id","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_events_actor_idx" ON "task_events" USING btree ("actor_id") WHERE "task_events"."actor_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_steps_client_idx" ON "task_flow_steps" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_steps_department_idx" ON "task_flow_steps" USING btree ("workspace_id","department_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_steps_category_idx" ON "task_flow_steps" USING btree ("workspace_id","category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_steps_assignee_idx" ON "task_flow_steps" USING btree ("workspace_id","assignee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_template_steps_department_idx" ON "task_flow_template_steps" USING btree ("workspace_id","department_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_template_steps_category_idx" ON "task_flow_template_steps" USING btree ("workspace_id","category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_template_steps_assignee_idx" ON "task_flow_template_steps" USING btree ("workspace_id","assignee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flow_templates_created_by_idx" ON "task_flow_templates" USING btree ("created_by") WHERE "task_flow_templates"."created_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flows_client_idx" ON "task_flows" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flows_template_idx" ON "task_flows" USING btree ("workspace_id","template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_flows_created_by_idx" ON "task_flows" USING btree ("created_by") WHERE "task_flows"."created_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_notes_user_idx" ON "task_notes" USING btree ("workspace_id","user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_recurring_idx" ON "tasks" USING btree ("workspace_id","recurring_task_id","competence");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_competence_idx" ON "tasks" USING btree ("workspace_id","competence") WHERE "tasks"."recurring_task_id" is not null;
--> statement-breakpoint

-- 4. Row Level Security and privileges ------------------------------------------------------------
ALTER TABLE "recurring_tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recurring_tasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "recurring_tasks_tenant_isolation" ON "recurring_tasks";
--> statement-breakpoint
CREATE POLICY "recurring_tasks_tenant_isolation" ON "recurring_tasks" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "recurring_tasks" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "recurring_tasks" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "recurring_tasks" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recurring_task_clients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "recurring_task_clients_tenant_isolation" ON "recurring_task_clients";
--> statement-breakpoint
CREATE POLICY "recurring_task_clients_tenant_isolation" ON "recurring_task_clients" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "recurring_task_clients" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "recurring_task_clients" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "recurring_task_clients" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_flow_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_flow_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_flow_templates_tenant_isolation" ON "task_flow_templates";
--> statement-breakpoint
CREATE POLICY "task_flow_templates_tenant_isolation" ON "task_flow_templates" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_flow_templates" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_flow_templates" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_flow_templates" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_flow_template_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_flow_template_steps_tenant_isolation" ON "task_flow_template_steps";
--> statement-breakpoint
CREATE POLICY "task_flow_template_steps_tenant_isolation" ON "task_flow_template_steps" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_flow_template_steps" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_flow_template_steps" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_flow_template_steps" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_flows" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_flows" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_flows_tenant_isolation" ON "task_flows";
--> statement-breakpoint
CREATE POLICY "task_flows_tenant_isolation" ON "task_flows" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_flows" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_flows" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_flows" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_flow_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_flow_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_flow_steps_tenant_isolation" ON "task_flow_steps";
--> statement-breakpoint
CREATE POLICY "task_flow_steps_tenant_isolation" ON "task_flow_steps" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_flow_steps" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_flow_steps" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_flow_steps" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_events_tenant_isolation" ON "task_events";
--> statement-breakpoint
CREATE POLICY "task_events_tenant_isolation" ON "task_events" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_events" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_events" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_events" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_attachments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_attachments_tenant_isolation" ON "task_attachments";
--> statement-breakpoint
CREATE POLICY "task_attachments_tenant_isolation" ON "task_attachments" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_attachments" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_attachments" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_attachments" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "task_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_notes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "task_notes_tenant_isolation" ON "task_notes";
--> statement-breakpoint
CREATE POLICY "task_notes_tenant_isolation" ON "task_notes" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "task_notes" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "task_notes" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_notes" TO effinance_app;
--> statement-breakpoint

-- 5. LGPD: the recorded name goes with the account (as in 0012) -----------------------------------
CREATE OR REPLACE FUNCTION "public"."recurring_tasks_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."created_by_name" := 'Usuário excluído';
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."recurring_tasks_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "recurring_tasks_forget_deleted_user" ON "recurring_tasks";
--> statement-breakpoint
CREATE TRIGGER "recurring_tasks_forget_deleted_user" BEFORE UPDATE OF "created_by" ON "recurring_tasks" FOR EACH ROW
  WHEN (OLD."created_by" IS NOT NULL AND NEW."created_by" IS NULL)
  EXECUTE FUNCTION "public"."recurring_tasks_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."task_flow_templates_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."created_by_name" := 'Usuário excluído';
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_flow_templates_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_flow_templates_forget_deleted_user" ON "task_flow_templates";
--> statement-breakpoint
CREATE TRIGGER "task_flow_templates_forget_deleted_user" BEFORE UPDATE OF "created_by" ON "task_flow_templates" FOR EACH ROW
  WHEN (OLD."created_by" IS NOT NULL AND NEW."created_by" IS NULL)
  EXECUTE FUNCTION "public"."task_flow_templates_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."task_flows_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."created_by_name" := 'Usuário excluído';
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_flows_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_flows_forget_deleted_user" ON "task_flows";
--> statement-breakpoint
CREATE TRIGGER "task_flows_forget_deleted_user" BEFORE UPDATE OF "created_by" ON "task_flows" FOR EACH ROW
  WHEN (OLD."created_by" IS NOT NULL AND NEW."created_by" IS NULL)
  EXECUTE FUNCTION "public"."task_flows_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."task_events_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."actor_name" := 'Usuário excluído';
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_events_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_events_forget_deleted_user" ON "task_events";
--> statement-breakpoint
CREATE TRIGGER "task_events_forget_deleted_user" BEFORE UPDATE OF "actor_id" ON "task_events" FOR EACH ROW
  WHEN (OLD."actor_id" IS NOT NULL AND NEW."actor_id" IS NULL)
  EXECUTE FUNCTION "public"."task_events_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."task_attachments_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."uploaded_by_name" := 'Usuário excluído';
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."task_attachments_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_attachments_forget_deleted_user" ON "task_attachments";
--> statement-breakpoint
CREATE TRIGGER "task_attachments_forget_deleted_user" BEFORE UPDATE OF "uploaded_by" ON "task_attachments" FOR EACH ROW
  WHEN (OLD."uploaded_by" IS NOT NULL AND NEW."uploaded_by" IS NULL)
  EXECUTE FUNCTION "public"."task_attachments_forget_deleted_user"();
