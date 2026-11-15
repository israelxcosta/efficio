-- 0022: the global search (⌘K) finds a client by the name of its responsible (QA #5). The name is
-- encrypted per field, so — like the CPF/CNPJ (`document_hash`) — it gets a blind index: HMAC with the
-- workspace key of the normalized name (lowercase, no accents, single spaces). Exact search only (the
-- full name); a partial name does not match. The backfill checks every workspace again
-- (`encryption_backfilled_at` cleared) and fills the index of the existing clients.
-- Re-runnable (IF NOT EXISTS) and also on PGlite (no CONCURRENTLY).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "responsible_name_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_responsible_name_hash_idx" ON "contacts" USING btree ("workspace_id","responsible_name_hash");--> statement-breakpoint
UPDATE "workspaces" SET "encryption_backfilled_at" = NULL WHERE "encryption_backfilled_at" IS NOT NULL;
