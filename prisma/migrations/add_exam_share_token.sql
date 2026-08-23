-- Add shareToken column to exams table for secure share links
-- Migration: add_exam_share_token

-- Add shareToken column (nullable to allow existing exams)
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;

-- Create unique index on shareToken (for fast lookups and uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_exams_share_token" ON "exams"("shareToken");

-- Create regular index for NULL-safe lookups
CREATE INDEX IF NOT EXISTS "idx_exams_share_token_not_null" ON "exams"("shareToken") WHERE "shareToken" IS NOT NULL;
