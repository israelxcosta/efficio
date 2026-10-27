-- 0010: due day per client and discount for paying the fee by its due date (desconto por pontualidade).
-- * contacts.fee_due_day: day of the month the client's fee is due (month after the competence). The
--   column is added with DEFAULT 10 so every existing row gets 10 through DDL (an UPDATE would see no
--   rows: the migrator owns the table and RLS is forced), then the default goes away (new suppliers
--   keep null). The API only reads it on clients.
-- * client_fees.discount_bps: discount offered in the fee period, in basis points (500 = 5%).
-- * transactions.fee_discount_bps: copied from the period into each generated fee (null = none).
-- * transactions.discount_of: the discount granted when a receivable is received by its due date is
--   its own paid expense pointing to it ("Despesas financeiras › Descontos concedidos"), so balances,
--   statements and reports need no change. It goes away with the receivable (cascade) and the API
--   removes it when the payment is reopened or re-dated after the due date. One per receivable.
-- Same tenant pattern as 0008/0009: the self reference is a composite key inside the workspace, backed
-- by transactions_workspace_id_id_uq (0008). Runs inside the migrator's transaction; re-runnable.

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "fee_due_day" integer DEFAULT 10;
--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "fee_due_day" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_fee_due_day_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_fee_due_day_chk" CHECK ("contacts"."fee_due_day" between 1 and 31);
--> statement-breakpoint
ALTER TABLE "client_fees" ADD COLUMN IF NOT EXISTS "discount_bps" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_fees" DROP CONSTRAINT IF EXISTS "client_fees_discount_chk";
--> statement-breakpoint
ALTER TABLE "client_fees" ADD CONSTRAINT "client_fees_discount_chk" CHECK ("client_fees"."discount_bps" between 0 and 9999);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "fee_discount_bps" integer;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "discount_of" uuid;
--> statement-breakpoint
-- Only generated fees offer a discount; 0 is stored as null ("no discount").
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_fee_discount_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_discount_chk" CHECK ("transactions"."fee_discount_bps" is null or ("transactions"."fee_discount_bps" between 1 and 9999 and "transactions"."fee_kind" = 'fee'));
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_discount_of_fk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_discount_of_fk" FOREIGN KEY ("workspace_id","discount_of") REFERENCES "public"."transactions"("workspace_id","id") ON DELETE cascade;
--> statement-breakpoint
-- A discount is a plain expense (never a late fee nor a generated fee).
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_discount_chk";
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_discount_chk" CHECK ("transactions"."discount_of" is null or ("transactions"."type" = 'expense' and "transactions"."late_fee_of" is null and "transactions"."fee_kind" is null));
--> statement-breakpoint
-- One discount per receivable; also the index the cascade from the receivable uses.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_discount_of_uq" ON "transactions" USING btree ("discount_of") WHERE "transactions"."discount_of" is not null;
