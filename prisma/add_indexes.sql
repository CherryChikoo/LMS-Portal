-- Add performance indexes for 50K+ student scale
-- These indexes optimize filtering, searching, and sorting operations

-- Students table indexes
CREATE INDEX IF NOT EXISTS "idx_students_department" ON "students"("department");
CREATE INDEX IF NOT EXISTS "idx_students_year" ON "students"("academicYear");
CREATE INDEX IF NOT EXISTS "idx_students_section" ON "students"("section");
CREATE INDEX IF NOT EXISTS "idx_students_enrollment_type" ON "students"("enrollmentType");
CREATE INDEX IF NOT EXISTS "idx_students_created_desc" ON "students"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_students_college_dept" ON "students"("collegeId", "department");

-- Users table indexes
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users"("status");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");
CREATE INDEX IF NOT EXISTS "idx_users_display_name" ON "users"("displayName");

-- Verify indexes were created
SELECT
    tablename,
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    schemaname = 'public'
    AND tablename IN ('students', 'users')
    AND indexname LIKE 'idx_%'
ORDER BY
    tablename, indexname;
