-- Quick Performance Optimization for 50k Students
-- Apply critical indexes only (most impactful)

-- Users table (login, auth lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_college_id ON users("collegeId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_auth_id ON users("authId");

-- Students table (filtering, sorting)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_college_id ON students("collegeId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_created_at ON students("createdAt" DESC);

-- Colleges table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_colleges_status ON colleges(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_colleges_is_deleted ON colleges("isDeleted");

-- Batches table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batches_college_id ON batches("collegeId");

-- Student_batches junction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_batches_student_id ON student_batches("studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_batches_batch_id ON student_batches("batchId");

-- Analyze tables
ANALYZE users;
ANALYZE students;
ANALYZE colleges;
ANALYZE batches;
ANALYZE student_batches;
