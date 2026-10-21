-- 0007: company records. Contacts become suppliers or clients (`kind`); clients carry the company
-- data (regime, Simples annex, contract start, responsible person) and can be inactivated with a
-- date and a reason. Fees (honorários) live in client_fees, one row per yearly period.
-- Same tenant pattern as 0004/0005: RLS forced, composite foreign keys inside the workspace, CHECKs
-- with the shared contract values. Runs inside the migrator's transaction; re-runnable.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint

-- 1. Contacts: kind + client columns ----------------------------------------------------------------
-- Existing contacts become suppliers. responsible_name/email/phone and inactivation_notes are
-- encrypted by the API with the workspace key (like the other personal fields of contacts).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'supplier' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "trade_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "opened_at" date;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "main_activity" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "responsible_name" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "responsible_email" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "responsible_phone" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "tax_regime" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "simples_annex" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "contract_start_date" date;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "inactivated_at" date;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "inactivation_reason" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "inactivation_notes" text;
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_kind_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_kind_chk" CHECK ("contacts"."kind" in ('client', 'supplier'));
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_status_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_status_chk" CHECK ("contacts"."status" in ('active', 'inactive'));
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_tax_regime_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tax_regime_chk" CHECK ("contacts"."tax_regime" in ('simples_nacional', 'mei', 'presumed_profit', 'real_profit', 'exempt', 'other'));
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_simples_annex_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_simples_annex_chk" CHECK ("contacts"."simples_annex" in ('I', 'II', 'III', 'IV', 'V'));
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_inactivation_reason_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_inactivation_reason_chk" CHECK ("contacts"."inactivation_reason" in ('accounting_transfer', 'contract_end', 'company_closure', 'default', 'other'));
--> statement-breakpoint
-- A client always has a regime and a contract start; the Simples annex only under the Simples.
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_client_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_chk" CHECK ("contacts"."kind" <> 'client' or ("contacts"."tax_regime" is not null and "contacts"."contract_start_date" is not null and ("contacts"."simples_annex" is null or "contacts"."tax_regime" = 'simples_nacional')));
--> statement-breakpoint
-- Inactive ⇔ date and reason recorded.
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_inactivation_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_inactivation_chk" CHECK (("contacts"."status" = 'inactive') = ("contacts"."inactivated_at" is not null and "contacts"."inactivation_reason" is not null));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_kind_idx" ON "contacts" USING btree ("workspace_id","kind","name");
--> statement-breakpoint
-- One client per CNPJ in the workspace (blind index of the encrypted document).
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_client_document_uq" ON "contacts" USING btree ("workspace_id","document_hash") WHERE "contacts"."kind" = 'client';
--> statement-breakpoint

-- 2. Fees (tenant) ----------------------------------------------------------------------------------
-- One row per yearly period: dates derive from contacts.contract_start_date + period_index years.
CREATE TABLE IF NOT EXISTS "client_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"period_index" integer NOT NULL,
	"amount" bigint NOT NULL,
	"employee_fee" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_fees_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_fees_period_chk" CHECK ("client_fees"."period_index" >= 0),
	CONSTRAINT "client_fees_amount_chk" CHECK ("client_fees"."amount" > 0 and "client_fees"."employee_fee" >= 0)
);
--> statement-breakpoint
ALTER TABLE "client_fees" DROP CONSTRAINT IF EXISTS "client_fees_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "client_fees" ADD CONSTRAINT "client_fees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
-- Fees belong to the client: they go away with it (deleting a client with transactions is refused
-- by the API).
ALTER TABLE "client_fees" DROP CONSTRAINT IF EXISTS "client_fees_client_fk";
--> statement-breakpoint
ALTER TABLE "client_fees" ADD CONSTRAINT "client_fees_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_fees_period_uq" ON "client_fees" USING btree ("client_id","period_index");
--> statement-breakpoint
ALTER TABLE "client_fees" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_fees" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "client_fees_tenant_isolation" ON "client_fees";
--> statement-breakpoint
CREATE POLICY "client_fees_tenant_isolation" ON "client_fees" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "client_fees" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "client_fees" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "client_fees" TO effinance_app;
