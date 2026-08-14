-- 1. Rename columns in `colleges`
ALTER TABLE public.colleges RENAME COLUMN student_count TO "studentCount";
ALTER TABLE public.colleges RENAME COLUMN admin_email TO "adminEmail";
ALTER TABLE public.colleges RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.colleges RENAME COLUMN updated_at TO "updatedAt";
ALTER TABLE public.colleges RENAME COLUMN deleted_at TO "deletedAt";
ALTER TABLE public.colleges RENAME COLUMN is_deleted TO "isDeleted";

-- 2. Rename columns in `users`
ALTER TABLE public.users RENAME COLUMN display_name TO "displayName";
ALTER TABLE public.users RENAME COLUMN college_id TO "collegeId";
ALTER TABLE public.users RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.users RENAME COLUMN updated_at TO "updatedAt";

-- 3. Rename columns in `batches`
ALTER TABLE public.batches RENAME COLUMN college_id TO "collegeId";
ALTER TABLE public.batches RENAME COLUMN academic_year TO "academicYear";
ALTER TABLE public.batches RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.batches RENAME COLUMN updated_at TO "updatedAt";

-- 4. Rename columns in `students`
ALTER TABLE public.students RENAME COLUMN college_id TO "collegeId";
ALTER TABLE public.students RENAME COLUMN academic_year TO "academicYear";
ALTER TABLE public.students RENAME COLUMN roll_number TO "rollNumber";
ALTER TABLE public.students RENAME COLUMN enrollment_no TO "enrollmentNo";
ALTER TABLE public.students RENAME COLUMN must_change_password TO "mustChangePassword";
ALTER TABLE public.students RENAME COLUMN enrollment_type TO "enrollmentType";
ALTER TABLE public.students RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.students RENAME COLUMN updated_at TO "updatedAt";

-- 5. Rename columns in `student_batches`
ALTER TABLE public.student_batches RENAME COLUMN student_id TO "studentId";
ALTER TABLE public.student_batches RENAME COLUMN batch_id TO "batchId";

-- 6. Rename columns in `exams`
ALTER TABLE public.exams RENAME COLUMN college_id TO "collegeId";
ALTER TABLE public.exams RENAME COLUMN duration_minutes TO "durationMinutes";
ALTER TABLE public.exams RENAME COLUMN total_marks TO "totalMarks";
ALTER TABLE public.exams RENAME COLUMN passing_marks TO "passingMarks";
ALTER TABLE public.exams RENAME COLUMN scheduled_at TO "scheduledAt";
ALTER TABLE public.exams RENAME COLUMN start_time TO "startTime";
ALTER TABLE public.exams RENAME COLUMN end_time TO "endTime";
ALTER TABLE public.exams RENAME COLUMN created_by TO "createdBy";
ALTER TABLE public.exams RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.exams RENAME COLUMN updated_at TO "updatedAt";
ALTER TABLE public.exams RENAME COLUMN deleted_at TO "deletedAt";

-- 7. Rename columns in `questions`
ALTER TABLE public.questions RENAME COLUMN exam_id TO "examId";
ALTER TABLE public.questions RENAME COLUMN correct_answer TO "correctAnswer";
ALTER TABLE public.questions RENAME COLUMN ai_explanation TO "aiExplanation";
ALTER TABLE public.questions RENAME COLUMN sort_order TO "sortOrder";
ALTER TABLE public.questions RENAME COLUMN created_at TO "createdAt";

-- 8. Rename columns in `exam_results`
ALTER TABLE public.exam_results RENAME COLUMN exam_id TO "examId";
ALTER TABLE public.exam_results RENAME COLUMN student_id TO "studentId";
ALTER TABLE public.exam_results RENAME COLUMN total_marks TO "totalMarks";
ALTER TABLE public.exam_results RENAME COLUMN correct_count TO "correctCount";
ALTER TABLE public.exam_results RENAME COLUMN incorrect_count TO "incorrectCount";
ALTER TABLE public.exam_results RENAME COLUMN ai_summary TO "aiSummary";
ALTER TABLE public.exam_results RENAME COLUMN time_taken_minutes TO "timeTakenMinutes";
ALTER TABLE public.exam_results RENAME COLUMN start_time TO "startTime";
ALTER TABLE public.exam_results RENAME COLUMN submitted_at TO "submittedAt";
ALTER TABLE public.exam_results RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.exam_results RENAME COLUMN updated_at TO "updatedAt";

-- 9. Rename columns in `resources`
ALTER TABLE public.resources RENAME COLUMN college_id TO "collegeId";
ALTER TABLE public.resources RENAME COLUMN created_by TO "createdBy";
ALTER TABLE public.resources RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.resources RENAME COLUMN updated_at TO "updatedAt";

-- 10. Rename columns in `doubts`
ALTER TABLE public.doubts RENAME COLUMN student_id TO "studentId";
ALTER TABLE public.doubts RENAME COLUMN college_id TO "collegeId";
ALTER TABLE public.doubts RENAME COLUMN resource_id TO "resourceId";
ALTER TABLE public.doubts RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.doubts RENAME COLUMN updated_at TO "updatedAt";

-- 11. Rename columns in `doubt_replies`
ALTER TABLE public.doubt_replies RENAME COLUMN doubt_id TO "doubtId";
ALTER TABLE public.doubt_replies RENAME COLUMN author_id TO "authorId";
ALTER TABLE public.doubt_replies RENAME COLUMN created_at TO "createdAt";

-- 12. Rename columns in `trainer_notes`
ALTER TABLE public.trainer_notes RENAME COLUMN student_id TO "studentId";
ALTER TABLE public.trainer_notes RENAME COLUMN author_name TO "authorName";
ALTER TABLE public.trainer_notes RENAME COLUMN created_at TO "createdAt";


-- CREATE PERMISSIVE RLS POLICIES FOR ALL TABLES (Temporary/Migration Fallback)
-- Colleges
CREATE POLICY "Permissive All - Colleges" ON public.colleges FOR ALL USING (true) WITH CHECK (true);
-- Users
CREATE POLICY "Permissive All - Users" ON public.users FOR ALL USING (true) WITH CHECK (true);
-- Batches
CREATE POLICY "Permissive All - Batches" ON public.batches FOR ALL USING (true) WITH CHECK (true);
-- Students
CREATE POLICY "Permissive All - Students" ON public.students FOR ALL USING (true) WITH CHECK (true);
-- Student Batches
CREATE POLICY "Permissive All - Student Batches" ON public.student_batches FOR ALL USING (true) WITH CHECK (true);
-- Exams
CREATE POLICY "Permissive All - Exams" ON public.exams FOR ALL USING (true) WITH CHECK (true);
-- Questions
CREATE POLICY "Permissive All - Questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);
-- Exam Results
CREATE POLICY "Permissive All - Exam Results" ON public.exam_results FOR ALL USING (true) WITH CHECK (true);
-- Resources
CREATE POLICY "Permissive All - Resources" ON public.resources FOR ALL USING (true) WITH CHECK (true);
-- Doubts
CREATE POLICY "Permissive All - Doubts" ON public.doubts FOR ALL USING (true) WITH CHECK (true);
-- Doubt Replies
CREATE POLICY "Permissive All - Doubt Replies" ON public.doubt_replies FOR ALL USING (true) WITH CHECK (true);
-- Trainer Notes
CREATE POLICY "Permissive All - Trainer Notes" ON public.trainer_notes FOR ALL USING (true) WITH CHECK (true);
