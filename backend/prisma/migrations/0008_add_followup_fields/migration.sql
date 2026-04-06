-- AlterTable
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "followup_count" INTEGER DEFAULT 0;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_followup_at" TIMESTAMPTZ;
