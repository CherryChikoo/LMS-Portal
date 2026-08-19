-- Performance Optimization Indexes for 50k+ Students
-- Migration: Add indexes for frequently queried fields

-- ============================================
-- USERS TABLE INDEXES
-- ============================================

-- Email lookup (login, duplicate checks)
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");

-- College filtering (dashboard, reports)
CREATE INDEX IF NOT EXISTS "idx_users_college_id" ON "users"("collegeId");

-- Role-based queries (admin lists, permissions)
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users"("role");

-- Auth user lookups (OAuth, session validation)
CREATE INDEX IF NOT EXISTS "idx_users_auth_id" ON "users"("authId");

-- Status filtering (active/inactive students)
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users"("status");

-- Composite index for college + role queries
CREATE INDEX IF NOT EXISTS "idx_users_college_role" ON "users"("collegeId", "role");

-- ============================================
-- STUDENTS TABLE INDEXES
-- ============================================

-- College filtering (most common query)
CREATE INDEX IF NOT EXISTS "idx_students_college_id" ON "students"("collegeId");

-- Department filtering
CREATE INDEX IF NOT EXISTS "idx_students_department" ON "students"("department");

-- Academic year filtering
CREATE INDEX IF NOT EXISTS "idx_students_academic_year" ON "students"("academicYear");

-- Section filtering
CREATE INDEX IF NOT EXISTS "idx_students_section" ON "students"("section");

-- Auth user lookups
CREATE INDEX IF NOT EXISTS "idx_students_auth_id" ON "students"("authId");

-- Enrollment type filtering (csv, manual, bulk)
CREATE INDEX IF NOT EXISTS "idx_students_enrollment_type" ON "students"("enrollmentType");

-- Created at for ordering recent students
CREATE INDEX IF NOT EXISTS "idx_students_created_at" ON "students"("createdAt" DESC);

-- Composite index for college + department queries
CREATE INDEX IF NOT EXISTS "idx_students_college_dept" ON "students"("collegeId", "department");

-- Composite index for college + academic year
CREATE INDEX IF NOT EXISTS "idx_students_college_year" ON "students"("collegeId", "academicYear");

-- ============================================
-- COLLEGES TABLE INDEXES
-- ============================================

-- Name lookup (case-insensitive search)
CREATE INDEX IF NOT EXISTS "idx_colleges_name_lower" ON "colleges"(LOWER("name"));

-- Status filtering
CREATE INDEX IF NOT EXISTS "idx_colleges_status" ON "colleges"("status");

-- Type filtering (registered, external)
CREATE INDEX IF NOT EXISTS "idx_colleges_type" ON "colleges"("type");

-- Soft delete filtering
CREATE INDEX IF NOT EXISTS "idx_colleges_is_deleted" ON "colleges"("isDeleted");

-- Created at ordering
CREATE INDEX IF NOT EXISTS "idx_colleges_created_at" ON "colleges"("createdAt" DESC);

-- ============================================
-- BATCHES TABLE INDEXES
-- ============================================

-- College filtering
CREATE INDEX IF NOT EXISTS "idx_batches_college_id" ON "batches"("collegeId");

-- Name lookup (case-insensitive)
CREATE INDEX IF NOT EXISTS "idx_batches_name_lower" ON "batches"(LOWER("name"));

-- Status filtering
CREATE INDEX IF NOT EXISTS "idx_batches_status" ON "batches"("status");

-- Department filtering
CREATE INDEX IF NOT EXISTS "idx_batches_department" ON "batches"("department");

-- Academic year filtering
CREATE INDEX IF NOT EXISTS "idx_batches_academic_year" ON "batches"("academicYear");

-- Created at ordering
CREATE INDEX IF NOT EXISTS "idx_batches_created_at" ON "batches"("createdAt" DESC);

-- Composite index for college + name (batch lookup during import)
CREATE INDEX IF NOT EXISTS "idx_batches_college_name" ON "batches"("collegeId", LOWER("name"));

-- ============================================
-- STUDENT_BATCHES TABLE INDEXES (JUNCTION)
-- ============================================

-- Student lookup (find batches for student)
CREATE INDEX IF NOT EXISTS "idx_student_batches_student_id" ON "student_batches"("studentId");

-- Batch lookup (find students in batch)
CREATE INDEX IF NOT EXISTS "idx_student_batches_batch_id" ON "student_batches"("batchId");

-- Composite index for junction queries
CREATE INDEX IF NOT EXISTS "idx_student_batches_composite" ON "student_batches"("studentId", "batchId");

-- ============================================
-- EXAMS TABLE INDEXES
-- ============================================

-- College filtering
CREATE INDEX IF NOT EXISTS "idx_exams_college_id" ON "exams"("collegeId");

-- Batch filtering
CREATE INDEX IF NOT EXISTS "idx_exams_batch_id" ON "exams"("batchId");

-- Status filtering
CREATE INDEX IF NOT EXISTS "idx_exams_status" ON "exams"("status");

-- Soft delete filtering
CREATE INDEX IF NOT EXISTS "idx_exams_deleted_at" ON "exams"("deletedAt");

-- Created at ordering
CREATE INDEX IF NOT EXISTS "idx_exams_created_at" ON "exams"("createdAt" DESC);

-- Composite for college + status
CREATE INDEX IF NOT EXISTS "idx_exams_college_status" ON "exams"("collegeId", "status");

-- ============================================
-- EXAM_RESULTS TABLE INDEXES
-- ============================================

-- Student lookup (student performance history)
CREATE INDEX IF NOT EXISTS "idx_exam_results_student_id" ON "exam_results"("studentId");

-- Exam lookup (exam leaderboard)
CREATE INDEX IF NOT EXISTS "idx_exam_results_exam_id" ON "exam_results"("examId");

-- Status filtering
CREATE INDEX IF NOT EXISTS "idx_exam_results_status" ON "exam_results"("status");

-- Pass/fail filtering
CREATE INDEX IF NOT EXISTS "idx_exam_results_passed" ON "exam_results"("passed");

-- Created at ordering
CREATE INDEX IF NOT EXISTS "idx_exam_results_created_at" ON "exam_results"("createdAt" DESC);

-- Composite for exam + student (unique attempts)
CREATE INDEX IF NOT EXISTS "idx_exam_results_exam_student" ON "exam_results"("examId", "studentId");

-- ============================================
-- RESOURCES TABLE INDEXES
-- ============================================

-- College filtering
CREATE INDEX IF NOT EXISTS "idx_resources_college_id" ON "resources"("collegeId");

-- Batch filtering
CREATE INDEX IF NOT EXISTS "idx_resources_batch_id" ON "resources"("batchId");

-- Type filtering
CREATE INDEX IF NOT EXISTS "idx_resources_type" ON "resources"("type");

-- Created at ordering
CREATE INDEX IF NOT EXISTS "idx_resources_created_at" ON "resources"("createdAt" DESC);

-- ============================================
-- TRAINER_NOTES TABLE INDEXES
-- ============================================

-- Student lookup (student notes history)
CREATE INDEX IF NOT EXISTS "idx_trainer_notes_student_id" ON "trainer_notes"("studentId");

-- Created at ordering
CREATE INDEX IF NOT EXISTS "idx_trainer_notes_created_at" ON "trainer_notes"("createdAt" DESC);

-- Performance optimization complete
