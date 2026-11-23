-- 0028: "conferido com o extrato" (simple reconciliation of paid rows against the bank statement).
-- Only a paid row can be reconciled. A trigger clears the mark whenever what was checked changes: the payment
-- is reopened, or its amount, payment date or account changes (every write path, bulk ones included).
-- Invoker rights, pinned search_path, not executable by PUBLIC (like 0012). Re-runnable, also on PGlite.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "reconciled_by" uuid;--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_reconciled_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."transactions_reconciled_reset"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW."reconciled_at" IS NOT NULL
     AND NEW."reconciled_at" IS NOT DISTINCT FROM OLD."reconciled_at"
     AND (NOT NEW."paid"
          OR NEW."amount" IS DISTINCT FROM OLD."amount"
          OR NEW."paid_at" IS DISTINCT FROM OLD."paid_at"
          OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
          OR NEW."to_account_id" IS DISTINCT FROM OLD."to_account_id") THEN
    NEW."reconciled_at" := NULL;
    NEW."reconciled_by" := NULL;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."transactions_reconciled_reset"() FROM PUBLIC;--> statement-breakpoint
DROP TRIGGER IF EXISTS "transactions_reconciled_reset" ON "transactions";--> statement-breakpoint
CREATE TRIGGER "transactions_reconciled_reset" BEFORE UPDATE ON "transactions" FOR EACH ROW
  WHEN (OLD."reconciled_at" IS NOT NULL)
  EXECUTE FUNCTION "public"."transactions_reconciled_reset"();--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_reconciled_chk";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reconciled_chk" CHECK (("transactions"."reconciled_at" is null or "transactions"."paid") and ("transactions"."reconciled_by" is null or "transactions"."reconciled_at" is not null));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_reconciled_by_idx" ON "transactions" USING btree ("reconciled_by") WHERE "transactions"."reconciled_by" is not null;
