-- Test query performance with new indexes

-- Test 1: Department filter (should use idx_students_department)
EXPLAIN ANALYZE
SELECT id, "collegeId", department, "academicYear", "createdAt"
FROM students
WHERE department = 'Computer Science'
ORDER BY "createdAt" DESC
LIMIT 100;

-- Test 2: Academic year filter (should use idx_students_year)
EXPLAIN ANALYZE
SELECT id, "collegeId", department, "academicYear"
FROM students
WHERE "academicYear" = '1st Year'
LIMIT 100;

-- Test 3: Composite filter (should use idx_students_college_dept)
EXPLAIN ANALYZE
SELECT id, "collegeId", department, "academicYear"
FROM students
WHERE "collegeId" IS NOT NULL
  AND department = 'Computer Science'
LIMIT 100;

-- Test 4: User status filter (should use idx_users_status)
EXPLAIN ANALYZE
SELECT u.id, u."displayName", u.email, u.status
FROM users u
WHERE u.status = 'active'
LIMIT 100;

-- Test 5: Count query (should be very fast)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM students;

-- Get actual row counts
SELECT 
    'students' as table_name,
    COUNT(*) as row_count
FROM students
UNION ALL
SELECT 
    'users' as table_name,
    COUNT(*) as row_count
FROM users;
