-- Citizen registration, citizen accounts, OTP sign-in, email/WhatsApp
-- messaging and the news-link feature are removed: staff sign in with
-- MASTER_PASSWORD, citizens are anonymous, and reports are anonymous only.
-- No citizen accounts or contact details were ever collected, so nothing
-- here holds data worth keeping.
DROP TABLE IF EXISTS "campaign_sends" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "suppressions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "otp_codes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "otp_test_codes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "issue_vote_selections" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "issue_vote_sets" CASCADE;--> statement-breakpoint
ALTER TABLE "flag_submissions" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "flag_admissions" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "home_ward_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "src_attribution";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "consent_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "consent_version";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "future_tools_opt_in";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_enabled";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "whatsapp_enabled";--> statement-breakpoint
DELETE FROM "app_settings" WHERE "key" = 'consent_wording_version';--> statement-breakpoint
-- Citizen accounts go; only staff roles remain.
DELETE FROM "sessions" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'citizen');--> statement-breakpoint
DELETE FROM "users" WHERE "role" = 'citizen';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
CREATE TYPE "public"."role_new" AS ENUM('transcriber', 'curator', 'admin');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."role_new" USING "role"::text::"public"."role_new";--> statement-breakpoint
DROP TYPE "public"."role";--> statement-breakpoint
ALTER TYPE "public"."role_new" RENAME TO "role";--> statement-breakpoint
-- budget_kind loses the OTP and news-query counters.
DELETE FROM "budget_counters" WHERE "kind"::text IN ('otp_send', 'news_query');--> statement-breakpoint
CREATE TYPE "public"."budget_kind_new" AS ENUM('geocode', 'epic_lookup', 'anonymous_vote');--> statement-breakpoint
ALTER TABLE "budget_counters" ALTER COLUMN "kind" TYPE "public"."budget_kind_new" USING "kind"::text::"public"."budget_kind_new";--> statement-breakpoint
DROP TYPE "public"."budget_kind";--> statement-breakpoint
ALTER TYPE "public"."budget_kind_new" RENAME TO "budget_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."send_code";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."send_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."suppression_reason";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."otp_purpose";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."channel";
