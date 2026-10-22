-- 0009: "Gerar honorários". A receivable generated for a client and a competence month (due in the
-- following month) records the month and its kind: the monthly fee, or the employee charge added to
-- it ("+ Empregados": headcount × the client's employee fee), which points to its fee and goes away
-- with it (cascade). A client is billed once per competence and a fee has one employee charge (partial
-- unique indexes; the generator inserts with ON CONFLICT DO NOTHING on the first one).
-- Same tenant pattern as 0004/0008: the self reference is a composite key inside the workspace, backed
-- by transactions_workspace_id_id_uq (0008). Runs inside the migrator's transaction; re-runnable.

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "fee_competence" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "fee_kind" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "fee_of" uuid;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "employees" integer;
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_fee_of_fk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_of_fk" FOREIGN KEY ("workspace_id","fee_of") REFERENCES "public"."transactions"("workspace_id","id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_fee_kind_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_kind_chk" CHECK ("transactions"."fee_kind" in ('fee', 'employees'));
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_fee_competence_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_competence_chk" CHECK ("transactions"."fee_competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_employees_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employees_chk" CHECK ("transactions"."employees" > 0);
--> statement-breakpoint
-- Generated rows are income with a competence; only the employee charge points to a fee and carries
-- the headcount (`is not distinct from`: a NULL kind must not pass the comparison).
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_fee_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_chk" CHECK (("transactions"."fee_kind" is null) = ("transactions"."fee_competence" is null) and ("transactions"."fee_kind" is null or "transactions"."type" = 'income') and ("transactions"."fee_kind" is not distinct from 'employees') = ("transactions"."fee_of" is not null) and ("transactions"."fee_of" is null) = ("transactions"."employees" is null));
--> statement-breakpoint
-- One fee per client and competence.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_fee_competence_uq" ON "transactions" USING btree ("workspace_id","contact_id","fee_competence") WHERE "transactions"."fee_kind" = 'fee';
--> statement-breakpoint
-- One employee charge per fee. fee_of is only set on employee charges (CHECK above), so this index is
-- also the one the cascade from the fee uses (a predicate on fee_kind could not serve that lookup).
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_fee_of_uq" ON "transactions" USING btree ("fee_of") WHERE "transactions"."fee_of" is not null;
