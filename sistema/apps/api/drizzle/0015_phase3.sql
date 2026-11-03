-- 0015: phase 3 (porte do Effy): permissions per person, clients' fiscal data, accesses and documents,
-- unions (sindicatos) and collective agreements, the office and its contract template, profile photos.
-- 1. workspace_members.permissions: the adjustments of each member over the role's defaults (only the
--    keys that differ; the owner never has any: `workspace_members_permissions_chk`). Identity table,
--    read with the membership on every request (no RLS, like before).
-- 2. contacts (clients): state/municipal registrations in clear; the responsible's CPF and the two
--    accesses (Simples Nacional access code, accountant's password) encrypted with the workspace key
--    (`contacts_secrets_chk` accepts only the `v1.<iv>.<ct>` format: no clear text). New columns, written
--    only by the API: no backfill.
-- 3. client_documents (Effy's CompanyReport): type from the catalog (or "other" with a name), optional
--    expiry, encrypted note, who changed it.
-- 4. unions, union_conventions (one cycle per year, published by whom/when) and union_clients (N:N).
--    The responsible's contact and the notes encrypted; CNPJ unique per workspace.
-- 5. offices: one per workspace; the responsible's CPF, e-mail and phone and the Pix key encrypted; logo
--    and watermark as bytes (type checked by signature in the API, at most 500 KB); the contract
--    template as JSON (null = factory template; watermark null = factory watermark).
-- 6. user_photos: profile photo of a user (identity data, one photo across workspaces), encrypted with a
--    platform key (IV + ciphertext + tag: `user_photos_size_chk`), cascades with the account. The API
--    login gets SELECT/INSERT/UPDATE/DELETE on it (test/db-roles.ts, docs/deploy-aws.md).
-- Same tenant pattern as 0004–0014: RLS forced with the workspace policy, composite foreign keys inside
-- the workspace, an index for every foreign key, plain DML granted to effinance_app only; authorship
-- names follow 0012 (deleting the account replaces the recorded name with "Usuário excluído", LGPD).
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

-- 1. Tables and the new columns ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "client_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"client_kind" text GENERATED ALWAYS AS ('client') STORED,
	"kind" text NOT NULL,
	"custom_name" text,
	"expires_at" date,
	"note" text,
	"updated_by" uuid,
	"updated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_documents_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_documents_kind_chk" CHECK ("client_documents"."kind" in ('digital_certificate', 'cnd_federal', 'cnd_state', 'cnd_municipal', 'crf_fgts', 'cndt', 'operating_license', 'sanitary_license', 'fire_certificate', 'environmental_license', 'pcmso', 'pgr', 'ltcat', 'professional_registration', 'other')),
	CONSTRAINT "client_documents_name_chk" CHECK (("client_documents"."kind" = 'other') = ("client_documents"."custom_name" is not null) and length("client_documents"."custom_name") between 1 and 80),
	CONSTRAINT "client_documents_note_chk" CHECK ("client_documents"."note" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("client_documents"."note") <= 2000),
	CONSTRAINT "client_documents_updated_by_name_chk" CHECK (length("client_documents"."updated_by_name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document" text,
	"legal_name" text,
	"trade_name" text,
	"state_registration" text,
	"municipal_registration" text,
	"zip_code" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"phone" text,
	"email" text,
	"website" text,
	"responsible_name" text,
	"responsible_document" text,
	"responsible_email" text,
	"responsible_phone" text,
	"pix_key_type" text,
	"pix_key" text,
	"logo" "bytea",
	"logo_type" text,
	"contract_blocks" jsonb,
	"contract_watermark" "bytea",
	"contract_watermark_type" text,
	"contract_watermark_enabled" boolean DEFAULT true NOT NULL,
	"contract_updated_at" timestamp with time zone,
	"contract_updated_by" uuid,
	"contract_updated_by_name" text,
	"updated_by" uuid,
	"updated_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offices_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "offices_document_chk" CHECK ("offices"."document" ~ '^[0-9]{14}$'),
	CONSTRAINT "offices_names_chk" CHECK (length("offices"."legal_name") between 1 and 200 and length("offices"."trade_name") <= 200 and length("offices"."responsible_name") <= 200),
	CONSTRAINT "offices_state_chk" CHECK ("offices"."state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "offices_pix_chk" CHECK ("offices"."pix_key_type" in ('cnpj', 'cpf', 'email', 'phone', 'random') and ("offices"."pix_key" is null) = ("offices"."pix_key_type" is null)),
	CONSTRAINT "offices_responsible_document_chk" CHECK ("offices"."responsible_document" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("offices"."responsible_document") <= 2000),
	CONSTRAINT "offices_responsible_email_chk" CHECK ("offices"."responsible_email" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("offices"."responsible_email") <= 2000),
	CONSTRAINT "offices_responsible_phone_chk" CHECK ("offices"."responsible_phone" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("offices"."responsible_phone") <= 2000),
	CONSTRAINT "offices_pix_key_chk" CHECK ("offices"."pix_key" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("offices"."pix_key") <= 2000),
	CONSTRAINT "offices_logo_chk" CHECK (("offices"."logo" is null) = ("offices"."logo_type" is null) and "offices"."logo_type" in ('image/png', 'image/jpeg', 'image/webp') and octet_length("offices"."logo") between 1 and 512000),
	CONSTRAINT "offices_watermark_chk" CHECK (("offices"."contract_watermark" is null) = ("offices"."contract_watermark_type" is null) and "offices"."contract_watermark_type" in ('image/png', 'image/jpeg', 'image/webp') and octet_length("offices"."contract_watermark") between 1 and 512000),
	CONSTRAINT "offices_contract_chk" CHECK (jsonb_typeof("offices"."contract_blocks") = 'array' and jsonb_array_length("offices"."contract_blocks") <= 500 and length("offices"."contract_blocks"::text) <= 1200000),
	CONSTRAINT "offices_recorded_names_chk" CHECK (length("offices"."updated_by_name") between 1 and 120 and length("offices"."contract_updated_by_name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "union_clients" (
	"workspace_id" uuid NOT NULL,
	"union_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"client_kind" text GENERATED ALWAYS AS ('client') STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "union_clients_pk" PRIMARY KEY("workspace_id","union_id","client_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "union_conventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"union_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"published_by_name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "union_conventions_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "union_conventions_year_chk" CHECK ("union_conventions"."year" between 2000 and 2100),
	CONSTRAINT "union_conventions_published_chk" CHECK ("union_conventions"."published" = ("union_conventions"."published_at" is not null) and ("union_conventions"."published_by_name" is null or length("union_conventions"."published_by_name") between 1 and 120) and ("union_conventions"."published" or "union_conventions"."published_by_name" is null)),
	CONSTRAINT "union_conventions_note_chk" CHECK ("union_conventions"."note" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("union_conventions"."note") <= 4000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"document" text NOT NULL,
	"acronym" text,
	"category" text,
	"territory" text,
	"zip_code" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"phone" text,
	"email" text,
	"website" text,
	"responsible_name" text,
	"responsible_role" text,
	"responsible_email" text,
	"responsible_phone" text,
	"base_month" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unions_workspace_id_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "unions_name_chk" CHECK (length("unions"."name") between 1 and 200),
	CONSTRAINT "unions_document_chk" CHECK ("unions"."document" ~ '^[0-9]{14}$'),
	CONSTRAINT "unions_base_month_chk" CHECK ("unions"."base_month" between 1 and 12),
	CONSTRAINT "unions_lengths_chk" CHECK (length("unions"."acronym") <= 30 and length("unions"."category") <= 120 and length("unions"."territory") <= 300 and length("unions"."responsible_role") <= 120 and length("unions"."website") <= 300),
	CONSTRAINT "unions_state_chk" CHECK ("unions"."state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "unions_responsible_name_chk" CHECK ("unions"."responsible_name" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("unions"."responsible_name") <= 2000),
	CONSTRAINT "unions_responsible_email_chk" CHECK ("unions"."responsible_email" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("unions"."responsible_email") <= 2000),
	CONSTRAINT "unions_responsible_phone_chk" CHECK ("unions"."responsible_phone" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("unions"."responsible_phone") <= 2000),
	CONSTRAINT "unions_notes_chk" CHECK ("unions"."notes" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("unions"."notes") <= 28000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_photos" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_photos_type_chk" CHECK ("user_photos"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "user_photos_size_chk" CHECK ("user_photos"."size_bytes" between 1 and 102400 and octet_length("user_photos"."content") = "user_photos"."size_bytes" + 28)
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "state_registration" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "state_registration_exempt" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "municipal_registration" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "responsible_document" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "simples_access_code" text;
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "accountant_password" text;
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

-- 2. Constraints (foreign keys composite inside the workspace; CHECKs of the new columns) --------
ALTER TABLE "client_documents" DROP CONSTRAINT IF EXISTS "client_documents_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "client_documents" DROP CONSTRAINT IF EXISTS "client_documents_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "client_documents" DROP CONSTRAINT IF EXISTS "client_documents_client_fk";
--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "offices" DROP CONSTRAINT IF EXISTS "offices_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "offices" DROP CONSTRAINT IF EXISTS "offices_contract_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_contract_updated_by_users_id_fk" FOREIGN KEY ("contract_updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "offices" DROP CONSTRAINT IF EXISTS "offices_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "union_clients" DROP CONSTRAINT IF EXISTS "union_clients_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "union_clients" ADD CONSTRAINT "union_clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "union_clients" DROP CONSTRAINT IF EXISTS "union_clients_union_fk";
--> statement-breakpoint
ALTER TABLE "union_clients" ADD CONSTRAINT "union_clients_union_fk" FOREIGN KEY ("workspace_id","union_id") REFERENCES "public"."unions"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "union_clients" DROP CONSTRAINT IF EXISTS "union_clients_client_fk";
--> statement-breakpoint
ALTER TABLE "union_clients" ADD CONSTRAINT "union_clients_client_fk" FOREIGN KEY ("workspace_id","client_id","client_kind") REFERENCES "public"."contacts"("workspace_id","id","kind") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "union_conventions" DROP CONSTRAINT IF EXISTS "union_conventions_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "union_conventions" ADD CONSTRAINT "union_conventions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "union_conventions" DROP CONSTRAINT IF EXISTS "union_conventions_published_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "union_conventions" ADD CONSTRAINT "union_conventions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "union_conventions" DROP CONSTRAINT IF EXISTS "union_conventions_union_fk";
--> statement-breakpoint
ALTER TABLE "union_conventions" ADD CONSTRAINT "union_conventions_union_fk" FOREIGN KEY ("workspace_id","union_id") REFERENCES "public"."unions"("workspace_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "unions" DROP CONSTRAINT IF EXISTS "unions_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "unions" ADD CONSTRAINT "unions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_photos" DROP CONSTRAINT IF EXISTS "user_photos_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_registrations_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_registrations_chk" CHECK (length("contacts"."state_registration") <= 40 and length("contacts"."municipal_registration") <= 40 and not ("contacts"."state_registration_exempt" and "contacts"."state_registration" is not null));
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_secrets_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_secrets_chk" CHECK ("contacts"."responsible_document" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("contacts"."responsible_document") <= 200 and "contacts"."simples_access_code" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("contacts"."simples_access_code") <= 1200 and "contacts"."accountant_password" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$' and length("contacts"."accountant_password") <= 1200);
--> statement-breakpoint
ALTER TABLE "workspace_members" DROP CONSTRAINT IF EXISTS "workspace_members_permissions_chk";
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_permissions_chk" CHECK (jsonb_typeof("workspace_members"."permissions") = 'object' and length("workspace_members"."permissions"::text) <= 2000 and ("workspace_members"."role" <> 'owner' or "workspace_members"."permissions" = '{}'::jsonb));
--> statement-breakpoint

-- 3. Indexes (every foreign key is backed by one) -------------------------------------------------
CREATE INDEX IF NOT EXISTS "client_documents_client_idx" ON "client_documents" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_documents_expires_idx" ON "client_documents" USING btree ("workspace_id","expires_at") WHERE "client_documents"."expires_at" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_documents_updated_by_idx" ON "client_documents" USING btree ("updated_by") WHERE "client_documents"."updated_by" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "offices_workspace_uq" ON "offices" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offices_updated_by_idx" ON "offices" USING btree ("updated_by") WHERE "offices"."updated_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offices_contract_updated_by_idx" ON "offices" USING btree ("contract_updated_by") WHERE "offices"."contract_updated_by" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "union_clients_client_idx" ON "union_clients" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "union_conventions_year_uq" ON "union_conventions" USING btree ("workspace_id","union_id","year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "union_conventions_published_by_idx" ON "union_conventions" USING btree ("published_by") WHERE "union_conventions"."published_by" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unions_document_uq" ON "unions" USING btree ("workspace_id","document");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unions_name_idx" ON "unions" USING btree ("workspace_id","active","name");
--> statement-breakpoint

-- 4. Row Level Security and privileges ------------------------------------------------------------
ALTER TABLE "client_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "client_documents_tenant_isolation" ON "client_documents";
--> statement-breakpoint
CREATE POLICY "client_documents_tenant_isolation" ON "client_documents" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "client_documents" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "client_documents" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "client_documents" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "unions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "unions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "unions_tenant_isolation" ON "unions";
--> statement-breakpoint
CREATE POLICY "unions_tenant_isolation" ON "unions" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "unions" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "unions" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "unions" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "union_conventions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "union_conventions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "union_conventions_tenant_isolation" ON "union_conventions";
--> statement-breakpoint
CREATE POLICY "union_conventions_tenant_isolation" ON "union_conventions" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "union_conventions" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "union_conventions" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "union_conventions" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "union_clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "union_clients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "union_clients_tenant_isolation" ON "union_clients";
--> statement-breakpoint
CREATE POLICY "union_clients_tenant_isolation" ON "union_clients" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "union_clients" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "union_clients" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "union_clients" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "offices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "offices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "offices_tenant_isolation" ON "offices";
--> statement-breakpoint
CREATE POLICY "offices_tenant_isolation" ON "offices" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "offices" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "offices" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "offices" TO effinance_app;
--> statement-breakpoint
REVOKE ALL ON "user_photos" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON "user_photos" FROM effinance_app;
--> statement-breakpoint

-- 5. LGPD: the recorded name goes with the account (as in 0012) -----------------------------------
CREATE OR REPLACE FUNCTION "public"."client_documents_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."updated_by_name" := CASE WHEN NEW."updated_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."client_documents_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "client_documents_forget_deleted_user" ON "client_documents";
--> statement-breakpoint
CREATE TRIGGER "client_documents_forget_deleted_user" BEFORE UPDATE OF "updated_by" ON "client_documents" FOR EACH ROW
  WHEN (OLD."updated_by" IS NOT NULL AND NEW."updated_by" IS NULL)
  EXECUTE FUNCTION "public"."client_documents_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."union_conventions_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."published_by_name" := CASE WHEN NEW."published_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."union_conventions_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "union_conventions_forget_deleted_user" ON "union_conventions";
--> statement-breakpoint
CREATE TRIGGER "union_conventions_forget_deleted_user" BEFORE UPDATE OF "published_by" ON "union_conventions" FOR EACH ROW
  WHEN (OLD."published_by" IS NOT NULL AND NEW."published_by" IS NULL)
  EXECUTE FUNCTION "public"."union_conventions_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."offices_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."updated_by_name" := CASE WHEN NEW."updated_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."offices_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "offices_forget_deleted_user" ON "offices";
--> statement-breakpoint
CREATE TRIGGER "offices_forget_deleted_user" BEFORE UPDATE OF "updated_by" ON "offices" FOR EACH ROW
  WHEN (OLD."updated_by" IS NOT NULL AND NEW."updated_by" IS NULL)
  EXECUTE FUNCTION "public"."offices_forget_deleted_user"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."offices_contract_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."contract_updated_by_name" := CASE WHEN NEW."contract_updated_by_name" IS NULL THEN NULL ELSE 'Usuário excluído' END;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."offices_contract_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "offices_contract_forget_deleted_user" ON "offices";
--> statement-breakpoint
CREATE TRIGGER "offices_contract_forget_deleted_user" BEFORE UPDATE OF "contract_updated_by" ON "offices" FOR EACH ROW
  WHEN (OLD."contract_updated_by" IS NOT NULL AND NEW."contract_updated_by" IS NULL)
  EXECUTE FUNCTION "public"."offices_contract_forget_deleted_user"();
