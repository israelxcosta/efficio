-- 0025: client onboarding (docs/onboarding-cliente.md). Tenant tables with RLS ENABLE + FORCE and the
-- usual policy, plain DML for effinance_app (nothing for the API login): the office's template
-- (`onboarding_templates`, one per workspace), a client's adjustment (`onboarding_client_overrides`), the
-- links sent (`onboarding_links`: only the SHA-256 of the token; recipient and reading confirmation
-- encrypted) and each opening (`onboarding_accesses`).
-- Public page: it must find the workspace of a token before its tenant transaction. A second policy of
-- `onboarding_links`, SELECT only and only for effinance_app, shows the single row whose `token_hash`
-- equals the transaction setting `app.onboarding_token` (set by that route alone, never with a workspace);
-- without the setting it matches nothing. No identity table, no grant to the API login and no SECURITY
-- DEFINER (the owner is NOBYPASSRLS and RLS is FORCEd, so a definer function would see nothing either).
-- `contacts.updated_at` (nullable: legacy rows read as `created_at`) is kept by a trigger when what the
-- onboarding shows changes (name, trade name, CNPJ, regime, contract start, status): the document's date.
-- Names recorded with the authors become "Usuário excluído" when the account is deleted (LGPD).
-- Runs inside the migrator's transaction; re-runnable and also on PGlite (no CONCURRENTLY).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_accesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device" text NOT NULL,
	"browser" text,
	"os" text,
	"ip" text,
	"city" text,
	CONSTRAINT "onboarding_accesses_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "onboarding_accesses_device_chk" CHECK ("onboarding_accesses"."device" in ('mobile', 'tablet', 'desktop', 'unknown')),
	CONSTRAINT "onboarding_accesses_lengths_chk" CHECK (length("onboarding_accesses"."browser") <= 40 and length("onboarding_accesses"."os") <= 40 and length("onboarding_accesses"."ip") <= 60 and length("onboarding_accesses"."city") <= 120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_client_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"client_kind" text GENERATED ALWAYS AS ('client') STORED,
	"content" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_client_overrides_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "onboarding_client_overrides_content_chk" CHECK (jsonb_typeof("onboarding_client_overrides"."content") = 'object' and length("onboarding_client_overrides"."content"::text) <= 400000),
	CONSTRAINT "onboarding_client_overrides_name_chk" CHECK (length("onboarding_client_overrides"."updated_by_name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"client_kind" text GENERATED ALWAYS AS ('client') STORED,
	"token_hash" text NOT NULL,
	"channel" text NOT NULL,
	"recipient_contact" text,
	"recipient_name" text,
	"recipient_to" text NOT NULL,
	"created_by" uuid,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoked_by_name" text,
	"confirmed_at" timestamp with time zone,
	"confirmed_name" text,
	"confirmed_cpf" text,
	"confirmed_ip" text,
	CONSTRAINT "onboarding_links_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "onboarding_links_token_hash_chk" CHECK ("onboarding_links"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "onboarding_links_channel_chk" CHECK ("onboarding_links"."channel" in ('whatsapp', 'email')),
	CONSTRAINT "onboarding_links_contact_chk" CHECK ("onboarding_links"."recipient_contact" in ('company', 'responsible')),
	CONSTRAINT "onboarding_links_expiry_chk" CHECK ("onboarding_links"."expires_at" > "onboarding_links"."created_at"),
	CONSTRAINT "onboarding_links_names_chk" CHECK (length("onboarding_links"."created_by_name") between 1 and 120 and length("onboarding_links"."revoked_by_name") between 1 and 120 and ("onboarding_links"."revoked_at" is not null or "onboarding_links"."revoked_by_name" is null)),
	CONSTRAINT "onboarding_links_confirmation_chk" CHECK (("onboarding_links"."confirmed_at" is null) = ("onboarding_links"."confirmed_name" is null) and ("onboarding_links"."confirmed_at" is null) = ("onboarding_links"."confirmed_cpf" is null) and length("onboarding_links"."confirmed_ip") <= 60),
	CONSTRAINT "onboarding_links_recipient_name_chk" CHECK ("onboarding_links"."recipient_name" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("onboarding_links"."recipient_name") <= 2000),
	CONSTRAINT "onboarding_links_recipient_to_chk" CHECK ("onboarding_links"."recipient_to" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("onboarding_links"."recipient_to") <= 2000),
	CONSTRAINT "onboarding_links_confirmed_name_chk" CHECK ("onboarding_links"."confirmed_name" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("onboarding_links"."confirmed_name") <= 2000),
	CONSTRAINT "onboarding_links_confirmed_cpf_chk" CHECK ("onboarding_links"."confirmed_cpf" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("onboarding_links"."confirmed_cpf") <= 2000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_templates_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "onboarding_templates_content_chk" CHECK (jsonb_typeof("onboarding_templates"."content") = 'object' and length("onboarding_templates"."content"::text) <= 400000),
	CONSTRAINT "onboarding_templates_name_chk" CHECK (length("onboarding_templates"."updated_by_name") between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "onboarding_accesses" DROP CONSTRAINT IF EXISTS "onboarding_accesses_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_accesses" ADD CONSTRAINT "onboarding_accesses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_accesses" DROP CONSTRAINT IF EXISTS "onboarding_accesses_link_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_accesses" ADD CONSTRAINT "onboarding_accesses_link_fk" FOREIGN KEY ("workspace_id","link_id") REFERENCES "public"."onboarding_links"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" DROP CONSTRAINT IF EXISTS "onboarding_client_overrides_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" ADD CONSTRAINT "onboarding_client_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" DROP CONSTRAINT IF EXISTS "onboarding_client_overrides_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" ADD CONSTRAINT "onboarding_client_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" DROP CONSTRAINT IF EXISTS "onboarding_client_overrides_client_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" ADD CONSTRAINT "onboarding_client_overrides_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_links" DROP CONSTRAINT IF EXISTS "onboarding_links_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_links" ADD CONSTRAINT "onboarding_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_links" DROP CONSTRAINT IF EXISTS "onboarding_links_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_links" ADD CONSTRAINT "onboarding_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_links" DROP CONSTRAINT IF EXISTS "onboarding_links_revoked_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_links" ADD CONSTRAINT "onboarding_links_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_links" DROP CONSTRAINT IF EXISTS "onboarding_links_client_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_links" ADD CONSTRAINT "onboarding_links_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_templates" DROP CONSTRAINT IF EXISTS "onboarding_templates_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding_templates" DROP CONSTRAINT IF EXISTS "onboarding_templates_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_accesses_link_idx" ON "onboarding_accesses" USING btree ("workspace_id","link_id","accessed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_client_overrides_client_uq" ON "onboarding_client_overrides" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_client_overrides_updated_by_idx" ON "onboarding_client_overrides" USING btree ("updated_by") WHERE "onboarding_client_overrides"."updated_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_links_client_idx" ON "onboarding_links" USING btree ("workspace_id","client_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_links_token_hash_uq" ON "onboarding_links" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_links_created_by_idx" ON "onboarding_links" USING btree ("created_by") WHERE "onboarding_links"."created_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_links_revoked_by_idx" ON "onboarding_links" USING btree ("revoked_by") WHERE "onboarding_links"."revoked_by" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_templates_workspace_uq" ON "onboarding_templates" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_templates_updated_by_idx" ON "onboarding_templates" USING btree ("updated_by") WHERE "onboarding_templates"."updated_by" is not null;
--> statement-breakpoint
ALTER TABLE "onboarding_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onboarding_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "onboarding_templates_tenant_isolation" ON "onboarding_templates";
--> statement-breakpoint
CREATE POLICY "onboarding_templates_tenant_isolation" ON "onboarding_templates" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "onboarding_templates" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "onboarding_templates" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "onboarding_templates" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onboarding_client_overrides" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "onboarding_client_overrides_tenant_isolation" ON "onboarding_client_overrides";
--> statement-breakpoint
CREATE POLICY "onboarding_client_overrides_tenant_isolation" ON "onboarding_client_overrides" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "onboarding_client_overrides" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "onboarding_client_overrides" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "onboarding_client_overrides" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "onboarding_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onboarding_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "onboarding_links_tenant_isolation" ON "onboarding_links";
--> statement-breakpoint
CREATE POLICY "onboarding_links_tenant_isolation" ON "onboarding_links" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "onboarding_links" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "onboarding_links" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "onboarding_links" TO effinance_app;
--> statement-breakpoint
DROP POLICY IF EXISTS "onboarding_links_public_token" ON "onboarding_links";
--> statement-breakpoint
CREATE POLICY "onboarding_links_public_token" ON "onboarding_links" AS PERMISSIVE FOR SELECT TO effinance_app USING ("token_hash" = nullif(current_setting('app.onboarding_token', true), ''));
--> statement-breakpoint
ALTER TABLE "onboarding_accesses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onboarding_accesses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "onboarding_accesses_tenant_isolation" ON "onboarding_accesses";
--> statement-breakpoint
CREATE POLICY "onboarding_accesses_tenant_isolation" ON "onboarding_accesses" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "onboarding_accesses" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "onboarding_accesses" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "onboarding_accesses" TO effinance_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."onboarding_templates_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."updated_by_name" := CASE WHEN NEW."updated_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."onboarding_templates_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "onboarding_templates_forget_deleted_user" ON "onboarding_templates";
--> statement-breakpoint
CREATE TRIGGER "onboarding_templates_forget_deleted_user" BEFORE UPDATE OF "updated_by" ON "onboarding_templates" FOR EACH ROW
  WHEN (OLD."updated_by" IS NOT NULL AND NEW."updated_by" IS NULL)
  EXECUTE FUNCTION "public"."onboarding_templates_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."onboarding_client_overrides_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."updated_by_name" := CASE WHEN NEW."updated_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."onboarding_client_overrides_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "onboarding_client_overrides_forget_deleted_user" ON "onboarding_client_overrides";
--> statement-breakpoint
CREATE TRIGGER "onboarding_client_overrides_forget_deleted_user" BEFORE UPDATE OF "updated_by" ON "onboarding_client_overrides" FOR EACH ROW
  WHEN (OLD."updated_by" IS NOT NULL AND NEW."updated_by" IS NULL)
  EXECUTE FUNCTION "public"."onboarding_client_overrides_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."onboarding_links_forget_creator"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."created_by_name" := CASE WHEN NEW."created_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."onboarding_links_forget_creator"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "onboarding_links_forget_creator" ON "onboarding_links";
--> statement-breakpoint
CREATE TRIGGER "onboarding_links_forget_creator" BEFORE UPDATE OF "created_by" ON "onboarding_links" FOR EACH ROW
  WHEN (OLD."created_by" IS NOT NULL AND NEW."created_by" IS NULL)
  EXECUTE FUNCTION "public"."onboarding_links_forget_creator"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."onboarding_links_forget_revoker"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."revoked_by_name" := CASE WHEN NEW."revoked_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."onboarding_links_forget_revoker"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "onboarding_links_forget_revoker" ON "onboarding_links";
--> statement-breakpoint
CREATE TRIGGER "onboarding_links_forget_revoker" BEFORE UPDATE OF "revoked_by" ON "onboarding_links" FOR EACH ROW
  WHEN (OLD."revoked_by" IS NOT NULL AND NEW."revoked_by" IS NULL)
  EXECUTE FUNCTION "public"."onboarding_links_forget_revoker"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."contacts_touch_updated_at"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."contacts_touch_updated_at"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "contacts_touch_updated_at" ON "contacts";
--> statement-breakpoint
CREATE TRIGGER "contacts_touch_updated_at" BEFORE UPDATE ON "contacts" FOR EACH ROW
  WHEN ((OLD."name", OLD."trade_name", OLD."document", OLD."tax_regime", OLD."contract_start_date", OLD."status")
    IS DISTINCT FROM (NEW."name", NEW."trade_name", NEW."document", NEW."tax_regime", NEW."contract_start_date", NEW."status"))
  EXECUTE FUNCTION "public"."contacts_touch_updated_at"();

