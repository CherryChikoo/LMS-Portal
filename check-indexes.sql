-- Check if indexes were actually created
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check if students query is using indexes
EXPLAIN ANALYZE 
SELECT * FROM students 
ORDER BY "createdAt" DESC;

-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND tablename IN ('students', 'users', 'colleges', 'batches')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
