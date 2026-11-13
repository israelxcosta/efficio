-- 0021: interest and fines in their own categories, the yearly fee adjustment in batch and the e-CAC
-- electronic power of attorney.
-- 1. Interest and fines (`late_fee_of is not null`) used to take the category of the original, so interest
--    on a fee counted as "Serviços Prestados › Honorários contábeis" (service revenue; in the Simples
--    Nacional interest and fines are not gross revenue — Res. CGSN 140/2018, art. 2º, §5º, II). The API
--    now books them into "Receitas financeiras › Juros e multas recebidos" (income) or "Despesas
--    financeiras › Juros e multas" (expense) — `LATE_FEE_CATEGORY` in packages/shared. The existing rows
--    are reclassified here, workspace by workspace (FORCE RLS applies to the owner too), creating the
--    categories where missing: matched by name ignoring case and surrounding spaces, an active one first,
--    like `ensureCategoryPath`.
-- 2. `fee_adjustments` (one batch: month, indices in basis points, percentage applied, who applied it)
--    and `fee_adjustment_items` (each fee period the batch registered, with the values it started from and
--    the ones applied — the letter's calculation). Tenant tables: RLS ENABLE + FORCE with the usual
--    policy, plain DML for effinance_app, composite foreign keys inside the workspace (the item goes with
--    its fee period), an index behind every foreign key; the recorded name of who applied becomes
--    "Usuário excluído" when the account is deleted (as in 0012/0015).
-- 3. `client_documents.kind` accepts `ecac_power_of_attorney` (procuração eletrônica e-CAC, up to 5 years).
-- Runs inside the migrator's transaction; re-runnable (IF NOT EXISTS, DROP … IF EXISTS before each
-- constraint/trigger/policy, CREATE OR REPLACE, idempotent updates) and also on PGlite (no CONCURRENTLY).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effinance_app') THEN
    RAISE EXCEPTION 'role effinance_app is missing (migration 0003 / docs/deploy-aws.md)';
  END IF;
END
$$;
--> statement-breakpoint

-- 1. Interest and fines in their own categories ----------------------------------------------------
DO $$
DECLARE
  v_ws uuid;
  v_type text;
  v_parent uuid;
  v_sub uuid;
  v_parent_name text;
  v_sub_name text;
  v_color text;
  v_previous text := current_setting('app.workspace_id', true);
BEGIN
  FOR v_ws IN SELECT w."id" FROM "public"."workspaces" w LOOP
    PERFORM set_config('app.workspace_id', v_ws::text, true);
    FOR v_type IN
      SELECT DISTINCT t."type" FROM "public"."transactions" t
       WHERE t."workspace_id" = v_ws AND t."late_fee_of" IS NOT NULL AND t."type" IN ('income', 'expense')
    LOOP
      IF v_type = 'income' THEN
        v_parent_name := 'Receitas financeiras';
        v_sub_name := 'Juros e multas recebidos';
        v_color := '#0F766E';
      ELSE
        v_parent_name := 'Despesas financeiras';
        v_sub_name := 'Juros e multas';
        v_color := '#E5484D';
      END IF;
      v_parent := NULL;
      v_sub := NULL;
      SELECT c."id" INTO v_parent FROM "public"."categories" c
       WHERE c."workspace_id" = v_ws AND c."type" = v_type AND c."parent_id" IS NULL
         AND lower(btrim(c."name")) = lower(v_parent_name)
       ORDER BY c."archived", c."created_at", c."id" LIMIT 1;
      IF v_parent IS NULL THEN
        INSERT INTO "public"."categories" ("workspace_id", "name", "type", "icon", "color")
        VALUES (v_ws, v_parent_name, v_type, 'landmark', v_color)
        RETURNING "id" INTO v_parent;
      END IF;
      SELECT c."id" INTO v_sub FROM "public"."categories" c
       WHERE c."workspace_id" = v_ws AND c."parent_id" = v_parent AND lower(btrim(c."name")) = lower(v_sub_name)
       ORDER BY c."archived", c."created_at", c."id" LIMIT 1;
      IF v_sub IS NULL THEN
        INSERT INTO "public"."categories" ("workspace_id", "parent_id", "name", "type", "icon", "color")
        SELECT v_ws, v_parent, v_sub_name, v_type, 'receipt', p."color" FROM "public"."categories" p
         WHERE p."workspace_id" = v_ws AND p."id" = v_parent
        RETURNING "id" INTO v_sub;
      END IF;
      UPDATE "public"."transactions" t
         SET "category_id" = v_parent, "subcategory_id" = v_sub
       WHERE t."workspace_id" = v_ws AND t."late_fee_of" IS NOT NULL AND t."type" = v_type
         AND (t."category_id" IS DISTINCT FROM v_parent OR t."subcategory_id" IS DISTINCT FROM v_sub);
    END LOOP;
  END LOOP;
  PERFORM set_config('app.workspace_id', coalesce(v_previous, ''), true);
END
$$;
--> statement-breakpoint

-- 2. Yearly fee adjustment in batch -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "fee_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"month" text NOT NULL,
	"igpm_bps" integer,
	"ipca_bps" integer,
	"inpc_bps" integer,
	"cct_bps" integer,
	"applied_bps" integer NOT NULL,
	"chosen_index" text,
	"adjust_employee_fee" boolean NOT NULL,
	"applied_by" uuid,
	"applied_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- Target of the items' composite foreign key: created with the table, never dropped by a re-run.
	CONSTRAINT "fee_adjustments_workspace_id_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_adjustment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"client_fee_id" uuid NOT NULL,
	"previous_amount" bigint NOT NULL,
	"previous_employee_fee" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"employee_fee" bigint NOT NULL,
	"discount_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_adjustment_items_workspace_id_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "fee_adjustments" DROP CONSTRAINT IF EXISTS "fee_adjustments_month_chk";
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_month_chk" CHECK ("fee_adjustments"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
--> statement-breakpoint
ALTER TABLE "fee_adjustments" DROP CONSTRAINT IF EXISTS "fee_adjustments_indices_chk";
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_indices_chk" CHECK ("fee_adjustments"."igpm_bps" between -10000 and 10000 and "fee_adjustments"."ipca_bps" between -10000 and 10000 and "fee_adjustments"."inpc_bps" between -10000 and 10000 and "fee_adjustments"."cct_bps" between -10000 and 10000);
--> statement-breakpoint
ALTER TABLE "fee_adjustments" DROP CONSTRAINT IF EXISTS "fee_adjustments_applied_chk";
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_applied_chk" CHECK ("fee_adjustments"."applied_bps" between 0 and 10000);
--> statement-breakpoint
ALTER TABLE "fee_adjustments" DROP CONSTRAINT IF EXISTS "fee_adjustments_chosen_index_chk";
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_chosen_index_chk" CHECK ("fee_adjustments"."chosen_index" in ('igpm', 'ipca', 'inpc', 'cct'));
--> statement-breakpoint
ALTER TABLE "fee_adjustments" DROP CONSTRAINT IF EXISTS "fee_adjustments_applied_by_name_chk";
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_applied_by_name_chk" CHECK (length("fee_adjustments"."applied_by_name") between 1 and 120);
--> statement-breakpoint
ALTER TABLE "fee_adjustments" DROP CONSTRAINT IF EXISTS "fee_adjustments_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_adjustments" DROP CONSTRAINT IF EXISTS "fee_adjustments_applied_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_adjustments_month_idx" ON "fee_adjustments" USING btree ("workspace_id","month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_adjustments_applied_by_idx" ON "fee_adjustments" USING btree ("applied_by") WHERE "fee_adjustments"."applied_by" is not null;
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" DROP CONSTRAINT IF EXISTS "fee_adjustment_items_values_chk";
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" ADD CONSTRAINT "fee_adjustment_items_values_chk" CHECK ("fee_adjustment_items"."previous_amount" > 0 and "fee_adjustment_items"."amount" > 0 and "fee_adjustment_items"."previous_employee_fee" >= 0 and "fee_adjustment_items"."employee_fee" >= 0);
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" DROP CONSTRAINT IF EXISTS "fee_adjustment_items_discount_chk";
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" ADD CONSTRAINT "fee_adjustment_items_discount_chk" CHECK ("fee_adjustment_items"."discount_bps" between 0 and 9999);
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" DROP CONSTRAINT IF EXISTS "fee_adjustment_items_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" ADD CONSTRAINT "fee_adjustment_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" DROP CONSTRAINT IF EXISTS "fee_adjustment_items_adjustment_fk";
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" ADD CONSTRAINT "fee_adjustment_items_adjustment_fk" FOREIGN KEY ("workspace_id","adjustment_id") REFERENCES "public"."fee_adjustments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- A batch's item goes with the fee period it registered (removing the period undoes the adjustment).
ALTER TABLE "fee_adjustment_items" DROP CONSTRAINT IF EXISTS "fee_adjustment_items_fee_fk";
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" ADD CONSTRAINT "fee_adjustment_items_fee_fk" FOREIGN KEY ("workspace_id","client_fee_id") REFERENCES "public"."client_fees"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fee_adjustment_items_fee_uq" ON "fee_adjustment_items" USING btree ("client_fee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fee_adjustment_items_adjustment_idx" ON "fee_adjustment_items" USING btree ("workspace_id","adjustment_id");
--> statement-breakpoint
ALTER TABLE "fee_adjustments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fee_adjustments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "fee_adjustments_tenant_isolation" ON "fee_adjustments";
--> statement-breakpoint
CREATE POLICY "fee_adjustments_tenant_isolation" ON "fee_adjustments" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "fee_adjustments" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "fee_adjustments" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_adjustments" TO effinance_app;
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fee_adjustment_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "fee_adjustment_items_tenant_isolation" ON "fee_adjustment_items";
--> statement-breakpoint
CREATE POLICY "fee_adjustment_items_tenant_isolation" ON "fee_adjustment_items" USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid) WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "fee_adjustment_items" FROM PUBLIC;
--> statement-breakpoint
REVOKE TRUNCATE, REFERENCES, TRIGGER ON "fee_adjustment_items" FROM effinance_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_adjustment_items" TO effinance_app;
--> statement-breakpoint
-- LGPD: the recorded name goes with the account (as in 0012/0015). Invoker rights, pinned search_path.
CREATE OR REPLACE FUNCTION "public"."fee_adjustments_forget_deleted_user"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."applied_by_name" := 'Usuário excluído';
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."fee_adjustments_forget_deleted_user"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "fee_adjustments_forget_deleted_user" ON "fee_adjustments";
--> statement-breakpoint
CREATE TRIGGER "fee_adjustments_forget_deleted_user" BEFORE UPDATE OF "applied_by" ON "fee_adjustments" FOR EACH ROW
  WHEN (OLD."applied_by" IS NOT NULL AND NEW."applied_by" IS NULL)
  EXECUTE FUNCTION "public"."fee_adjustments_forget_deleted_user"();
--> statement-breakpoint

-- 3. Electronic power of attorney in the e-CAC ------------------------------------------------------
ALTER TABLE "client_documents" DROP CONSTRAINT IF EXISTS "client_documents_kind_chk";
--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_kind_chk" CHECK ("client_documents"."kind" in ('digital_certificate', 'ecac_power_of_attorney', 'cnd_federal', 'cnd_state', 'cnd_municipal', 'crf_fgts', 'cndt', 'operating_license', 'sanitary_license', 'fire_certificate', 'environmental_license', 'pcmso', 'pgr', 'ltcat', 'professional_registration', 'other'));
