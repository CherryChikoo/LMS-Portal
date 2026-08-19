-- Apply Performance Indexes via Supabase SQL Editor
-- Copy and paste this entire file into Supabase SQL Editor and run
-- NOTE: CONCURRENTLY removed for Supabase compatibility

-- ============================================
-- CRITICAL INDEXES (Apply these first)
-- ============================================

-- Users table - Most critical for auth and login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_college_id ON users("collegeId");
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users("authId");

-- Students table - Most queried table
CREATE INDEX IF NOT EXISTS idx_students_college_id ON students("collegeId");
CREATE INDEX IF NOT EXISTS idx_students_created_at ON students("createdAt" DESC);

-- Student_batches junction - Critical for batch operations
CREATE INDEX IF NOT EXISTS idx_student_batches_student_id ON student_batches("studentId");
CREATE INDEX IF NOT EXISTS idx_student_batches_batch_id ON student_batches("batchId");

-- Colleges
CREATE INDEX IF NOT EXISTS idx_colleges_is_deleted ON colleges("isDeleted");

-- Batches - Critical for CSV import
CREATE INDEX IF NOT EXISTS idx_batches_college_id ON batches("collegeId");

-- ============================================
-- ADDITIONAL INDEXES
-- ============================================

-- Users table
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_college_role ON users("collegeId", role);

-- Students table
CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);
CREATE INDEX IF NOT EXISTS idx_students_academic_year ON students("academicYear");
CREATE INDEX IF NOT EXISTS idx_students_section ON students(section);
CREATE INDEX IF NOT EXISTS idx_students_enrollment_type ON students("enrollmentType");
CREATE INDEX IF NOT EXISTS idx_students_college_dept ON students("collegeId", department);

-- Colleges table
CREATE INDEX IF NOT EXISTS idx_colleges_status ON colleges(status);
CREATE INDEX IF NOT EXISTS idx_colleges_type ON colleges(type);
CREATE INDEX IF NOT EXISTS idx_colleges_created_at ON colleges("createdAt" DESC);

-- Batches table
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches("createdAt" DESC);

-- Exams table (no batchId column in schema)
CREATE INDEX IF NOT EXISTS idx_exams_college_id ON exams("collegeId");
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_deleted_at ON exams("deletedAt");
CREATE INDEX IF NOT EXISTS idx_exams_created_at ON exams("createdAt" DESC);

-- Exam_results table
CREATE INDEX IF NOT EXISTS idx_exam_results_student_id ON exam_results("studentId");
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id ON exam_results("examId");
CREATE INDEX IF NOT EXISTS idx_exam_results_status ON exam_results(status);
CREATE INDEX IF NOT EXISTS idx_exam_results_created_at ON exam_results("createdAt" DESC);

-- Resources table (no batchId column in schema)
CREATE INDEX IF NOT EXISTS idx_resources_college_id ON resources("collegeId");
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources("createdAt" DESC);

-- Trainer notes
CREATE INDEX IF NOT EXISTS idx_trainer_notes_student_id ON trainer_notes("studentId");
CREATE INDEX IF NOT EXISTS idx_trainer_notes_created_at ON trainer_notes("createdAt" DESC);

-- Update database statistics for query planner
ANALYZE users;
ANALYZE students;
ANALYZE colleges;
ANALYZE batches;
ANALYZE student_batches;
ANALYZE exams;
ANALYZE exam_results;
ANALYZE resources;
ANALYZE trainer_notes;

-- Verify indexes were created (run this separately to see results)
-- SELECT 
--     schemaname,
--     tablename,
--     indexname,
--     indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
