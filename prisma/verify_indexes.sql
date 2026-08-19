-- Verify all performance indexes exist
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
