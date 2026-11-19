-- 0026: database security review. Personal data of `contacts` must never sit in clear text, even if a
-- code path forgets FieldCipher: only 3 of its 16 encrypted columns (0015: responsible CPF and the two
-- accesses) were checked by the database. Every column the API encrypts (CONTACT_ALL_ENCRYPTED_FIELDS:
-- CPF/CNPJ, e-mail, phone, address, notes, responsible's name/e-mail/phone, inactivation notes) must now
-- be `v1.<iv>.<ct>` or empty, and the blind indexes (`document_hash`, `responsible_name_hash`) must be
-- HMAC-SHA-256 in hex (a CPF/CNPJ written there in clear is refused).
-- NOT VALID, like 0013: new writes are checked right away; rows written before field encryption are
-- encrypted by the backfill that `db:migrate` (and the demo's boot) runs after the migrations — every
-- workspace is marked for it again below (src/db/backfill.ts now covers all 13 columns).
-- Runs inside the migrator's transaction; re-runnable (DROP … IF EXISTS first) and also on PGlite.
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_encrypted_fields_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_encrypted_fields_chk" CHECK (("contacts"."document" = '' or "contacts"."document" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."email" = '' or "contacts"."email" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."phone" = '' or "contacts"."phone" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."zip_code" = '' or "contacts"."zip_code" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."street" = '' or "contacts"."street" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."number" = '' or "contacts"."number" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."complement" = '' or "contacts"."complement" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."district" = '' or "contacts"."district" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."notes" = '' or "contacts"."notes" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."responsible_name" = '' or "contacts"."responsible_name" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."responsible_email" = '' or "contacts"."responsible_email" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."responsible_phone" = '' or "contacts"."responsible_phone" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$') and ("contacts"."inactivation_notes" = '' or "contacts"."inactivation_notes" ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{23,}$')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_blind_index_chk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_blind_index_chk" CHECK ("contacts"."document_hash" ~ '^[0-9a-f]{64}$' and "contacts"."responsible_name_hash" ~ '^[0-9a-f]{64}$') NOT VALID;
--> statement-breakpoint
UPDATE "workspaces" SET "encryption_backfilled_at" = NULL;
