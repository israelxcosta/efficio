-- 0008: interest (juros) and fines (multa) of late payments. Confirming a transaction after its due
-- date may charge both: each becomes its own paid transaction (same type, account, contact and
-- category) pointing to the one settled late, so balances, statements and reports need no change.
-- They go away with it (cascade) and the API removes them when the payment is reopened.
-- Same tenant pattern as 0004: the self reference is a composite key inside the workspace.
-- Runs inside the migrator's transaction; re-runnable.

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "late_fee_of" uuid;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "late_fee_kind" text;
--> statement-breakpoint
-- Target of the composite foreign key below (every tenant parent has it). Created only when missing:
-- later self references (0009) depend on it, so a re-run must not drop it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.transactions'::regclass AND conname = 'transactions_workspace_id_id_uq'
  ) THEN
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_id_uq" UNIQUE("workspace_id","id");
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_late_fee_fk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_late_fee_fk" FOREIGN KEY ("workspace_id","late_fee_of") REFERENCES "public"."transactions"("workspace_id","id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_late_fee_kind_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_late_fee_kind_chk" CHECK ("transactions"."late_fee_kind" in ('interest', 'fine'));
--> statement-breakpoint
-- A late fee always says which one it is.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_late_fee_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_late_fee_chk" CHECK (("transactions"."late_fee_of" is null) = ("transactions"."late_fee_kind" is null));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_late_fee_idx" ON "transactions" USING btree ("late_fee_of") WHERE "transactions"."late_fee_of" is not null;
