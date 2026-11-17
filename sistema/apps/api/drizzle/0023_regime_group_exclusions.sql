-- 0023: the office edits its regime groups ("incluir e excluir tarefas no regime"). A catalog item the
-- office removed from a regime's group is recorded in `regime_group_exclusions` (workspace × regime ×
-- catalog key): the listing shows it apart, it is not counted as missing and "Aplicar grupo" does not
-- recreate it; restoring deletes the row. Own tasks of a group are plain recurring tasks of the registry
-- with the regime in `regimes` (no table). Tenant table: RLS ENABLE + FORCE with the usual policy, plain
-- DML for effinance_app (nothing for the API login), the remover goes to NULL when the account is deleted.
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS before each
-- constraint/policy) and also on PGlite (no CONCURRENTLY).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regime_group_exclusions" (
	"workspace_id" uuid NOT NULL,
	"regime" text NOT NULL,
	"catalog_key" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regime_group_exclusions_pk" PRIMARY KEY("workspace_id","regime","catalog_key")
);
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" DROP CONSTRAINT IF EXISTS "regime_group_exclusions_regime_chk";
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" ADD CONSTRAINT "regime_group_exclusions_regime_chk" CHECK ("regime_group_exclusions"."regime" in ('simples_nacional', 'mei', 'presumed_profit', 'real_profit'));
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" DROP CONSTRAINT IF EXISTS "regime_group_exclusions_catalog_key_chk";
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" ADD CONSTRAINT "regime_group_exclusions_catalog_key_chk" CHECK ("regime_group_exclusions"."catalog_key" ~ '^[a-z0-9_]{1,60}$');
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" DROP CONSTRAINT IF EXISTS "regime_group_exclusions_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" ADD CONSTRAINT "regime_group_exclusions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" DROP CONSTRAINT IF EXISTS "regime_group_exclusions_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" ADD CONSTRAINT "regime_group_exclusions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regime_group_exclusions_created_by_idx" ON "regime_group_exclusions" USING btree ("created_by") WHERE "regime_group_exclusions"."created_by" is not null;
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "regime_group_exclusions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "regime_group_exclusions_tenant_isolation" ON "regime_group_exclusions";
--> statement-breakpoint
CREATE POLICY "regime_group_exclusions_tenant_isolation" ON "regime_group_exclusions" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "regime_group_exclusions" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "regime_group_exclusions" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "regime_group_exclusions" TO effinance_app;
