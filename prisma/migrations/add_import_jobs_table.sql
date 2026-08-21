-- Create import_jobs table for background CSV import processing
-- This allows handling large imports (25K+) without Vercel timeout issues

CREATE TABLE IF NOT EXISTS import_jobs (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) UNIQUE NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  total_rows INTEGER NOT NULL,
  processed_rows INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
  rows_data JSONB NOT NULL, -- Array of CSV rows to process
  enrollment_type VARCHAR(50) DEFAULT 'csv',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster job lookups
CREATE INDEX IF NOT EXISTS idx_import_jobs_job_id ON import_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at DESC);

-- Add comment
COMMENT ON TABLE import_jobs IS 'Queue for background processing of large CSV imports to avoid API timeouts';
