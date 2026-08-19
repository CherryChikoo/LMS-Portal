-- QUICK FIX: Run this in Supabase SQL Editor NOW
-- This updates database statistics so indexes are used

ANALYZE students;
ANALYZE users;
ANALYZE colleges;
ANALYZE batches;
ANALYZE student_batches;
ANALYZE exams;
ANALYZE exam_results;
ANALYZE resources;

-- Verify indexes exist
SELECT 
    tablename,
    COUNT(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
GROUP BY tablename
ORDER BY tablename;

-- This should show:
-- batches: 2-3 indexes
-- colleges: 3-4 indexes
-- exam_results: 3-4 indexes
-- exams: 3-4 indexes
-- resources: 2-3 indexes
-- students: 6-8 indexes
-- trainer_notes: 2 indexes
-- users: 5-6 indexes
-- student_batches: 2-3 indexes
