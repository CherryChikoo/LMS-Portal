REALISTIC LMS TEST DATA + HUMAN-LIKE WORKFLOW SIMULATION

Continue from the EXISTING LMS Portal. Do not rebuild the system.

The current portal already contains approximately 20,000+ students, 30+ colleges and existing batches. The dashboard currently shows values such as 20,737 students, 31 colleges and 6,209 batches. These values indicate that the existing data may contain previously generated/imported records.

Your objective is to create a realistic test environment that behaves as if real college administrators, trainers and students manually used the LMS — while preserving every existing portal function.

IMPORTANT:
DO NOT BREAK THE EXISTING PORTAL.
DO NOT DELETE EXISTING STUDENTS, COLLEGES, BATCHES, AUTH USERS OR WORKING DATA.
DO NOT CREATE A PARALLEL DATABASE SYSTEM.
DO NOT BYPASS EXISTING BUSINESS LOGIC.
DO NOT INSERT disconnected/fake result rows simply to make dashboard numbers appear.
USE THE EXISTING APPLICATION WORKFLOWS, SERVICES, DATABASE RELATIONSHIPS, AUTHORIZATION AND RLS.

==================================================
1. FIRST INSPECT THE EXISTING SYSTEM
==================================================

Before creating anything, inspect:

- Current Supabase schema
- Existing students
- Existing colleges
- Existing batches
- Existing departments
- Student ↔ college relationships
- Student ↔ batch relationships
- Admin/trainer roles
- Student authentication
- College/admin authorization
- Exam creation workflow
- Exam assignment workflow
- Student exam availability logic
- Exam attempt workflow
- Exam submission workflow
- Evaluation logic
- Results workflow
- Resource creation workflow
- Resource assignment/visibility logic
- Dashboard statistics
- Existing seed/test data
- Existing validation
- Existing RLS policies

Understand how a REAL user performing an operation through the UI causes database records and relationships to be created.

Then reproduce those same relationships programmatically where necessary.

==================================================
2. USE THE EXISTING DATA
==================================================

Use the existing students, colleges and batches.

DO NOT recreate the 20,000 students.

DO NOT create duplicate colleges.

DO NOT create duplicate batches.

DO NOT replace existing data.

First calculate the actual current counts from the database.

The dashboard currently shows approximately:

Students: 20,737
Colleges: 31
Batches: 6,209

Do NOT blindly hardcode these numbers.

The database is the source of truth.

If the existing data contains 20,737 students, use those exact students.

==================================================
3. CREATE 50 REAL EXAMS
==================================================

Create exactly 50 NEW legitimate exams.

Use realistic academic names.

Examples:

- Data Structures & Algorithms — Mid Term Assessment
- DBMS — SQL & Normalization Assessment
- Operating Systems — Internal Examination
- Java Programming — Unit Assessment
- Computer Networks — Module 3 Assessment
- Python Programming — Programming Fundamentals
- Web Development — Full Stack Assessment
- Software Engineering — Internal Assessment
- Artificial Intelligence — Fundamentals
- Cyber Security — Security Concepts Assessment

Every exam must contain real questions.

Use the existing question structure.

Each exam should contain approximately 10–30 questions.

Use realistic:

- Questions
- Options
- Correct answers
- Marks
- Explanations if supported
- Duration
- Passing marks
- Instructions

Do NOT create empty exams.

==================================================
4. REALISTIC ASSIGNMENT DISTRIBUTION
==================================================

Create a mixture of assignment scopes.

Approximately:

30 college/batch-specific exams
20 global exams

However, use the EXISTING assignment mechanism.

Do not manually duplicate global exams for every college.

For college-specific exams:

- Select existing colleges
- Select existing batches where supported
- Use actual IDs
- Ensure students belong to those colleges/batches

Use varied assignments.

Example:

Exam A:
College 4
CSE-A
CSE-B

Exam B:
College 12
IT-A

Exam C:
College 19
AIML-A
AIML-B

Exam D:
Global

Do not assign every exam to everyone.

==================================================
5. REALISTIC EXAM STATES
==================================================

Use the statuses actually supported by the portal.

Create a realistic mixture such as:

10 Scheduled
5 Active
20 Completed
10 Expired

Ensure dates actually correspond to those states.

For example:

Completed:
start/end dates in the past

Active:
current date/time falls inside the exam window

Scheduled:
future start date

Expired:
end date in the past


Never create logically contradictory states.

==================================================
6. CREATE 50 REAL RESOURCES
==================================================

Create exactly 50 legitimate learning resources.

Use the existing resource workflow/schema.

Examples:

- Data Structures Complete Notes
- DBMS SQL Practice Guide
- Operating Systems Revision Notes
- Java Programming Handbook
- Python Fundamentals
- Computer Networks Revision Material
- Web Development Guide
- Artificial Intelligence Study Material
- Cyber Security Fundamentals
- Software Engineering Unit Notes

Approximately:

30 college/batch-specific resources
20 global resources

Use existing supported resource types only.

Do not create fake broken file references.

==================================================
7. SIMULATE REAL STUDENT EXAM ACTIVITY
==================================================

This is CRITICAL.

Do not simply insert result records.

Simulate the same logical lifecycle a student follows.

The expected workflow is:

Student is eligible
↓
Exam appears in student portal
↓
Student opens exam
↓
Student views instructions
↓
Student starts exam
↓
Attempt is created
↓
Student answers questions
↓
Some questions may remain unanswered
↓
Student changes some answers
↓
Student submits
↓
Existing evaluation logic executes
↓
Result is generated
↓
Result appears in Results section

Use the existing attempt/evaluation system wherever possible.

Do not bypass evaluation logic just to manufacture scores.

==================================================
8. REALISTIC STUDENT BEHAVIOR
==================================================

Do not make every student behave identically.

For eligible students:

- Some should not attempt
- Some should start and complete
- Some should submit early
- Some should use most of the duration
- Some should leave questions unanswered
- Some should score 90–100%
- Some 80–89%
- Some 70–79%
- Some 60–69%
- Some 50–59%
- Some below passing
- Some should have near-perfect attempts
- Some should have average attempts

Do NOT use a uniform random score generator.

Make the distribution look like genuine student performance.

Also vary:

- Start time
- Submission time
- Answer patterns
- Number answered
- Number unanswered
- Correct/incorrect answers
- Time taken

==================================================
9. ELIGIBILITY MUST BE CORRECT
==================================================

This is extremely important.

Only students who should have access to an exam may create attempts/results for that exam.

For college-specific exams:

Student college must match the assignment.

For batch-specific exams:

Student batch must match.

For global exams:

Use the existing global eligibility behavior.

Do NOT create results for unauthorized students.

==================================================
10. COLLEGE ADMIN / TRAINER BEHAVIOR
==================================================

Test the portal as if multiple college administrators/trainers manually used it.

Use existing authorized accounts/roles where available.

Do not create fake permissions.

Test:

College Admin A
→ sees permitted college data
→ sees assigned students
→ sees permitted batches
→ sees permitted exams
→ sees permitted resources
→ sees permitted results

College Admin B
→ sees its own permitted data
→ cannot access another college's restricted data

Global Admin:
→ can see global data
→ can manage permitted colleges
→ can see global assignments
→ can see overall results

Trainer:
→ can see/manage only what the existing role allows

Do NOT modify RLS just to make these tests pass.

If access is currently restricted correctly, preserve it.

==================================================
11. STUDENT ACCESS TESTING
==================================================

Use existing student accounts where available.

Test multiple students from:

- Different colleges
- Different batches
- Different departments
- Different sections

For each test student verify:

1. Login works
2. Dashboard loads
3. Assigned exams appear
4. Unauthorized exams do NOT appear
5. Assigned resources appear
6. Unauthorized resources do NOT appear
7. Student can open an assigned exam
8. Student can start an attempt
9. Student can answer questions
10. Student can submit
11. Result is generated
12. Result appears correctly
13. Student cannot access another student's result
14. Student cannot access admin-only pages

==================================================
12. TEST CROSS-COLLEGE SECURITY
==================================================

This must be explicitly tested.

Example:

Student from College A:

MUST be able to:
- Access College A assignments
- Access global assignments

MUST NOT be able to:
- Access College B restricted assignments
- View College B students
- View College B private resources
- View College B restricted results

College Admin A:

MUST NOT be able to access restricted College B data.

Global Admin:

MAY access according to the existing role permissions.

Do not weaken authorization to make test data easier.

==================================================
13. RESULTS MUST BE REALISTIC
==================================================

After generating attempts, verify the Results section.

Results should naturally contain:

- Student
- Exam
- College
- Batch
- Attempt
- Score
- Percentage
- Correct answers
- Incorrect answers
- Unanswered
- Time taken
- Submission time
- Pass/fail
- Evaluation status

Only use fields supported by the existing schema.

If the application calculates values automatically, let the application calculate them.

Do not overwrite calculated values with arbitrary numbers.

==================================================
14. DASHBOARD VALIDATION
==================================================

After generation, verify the dashboard.

Statistics should be based on REAL database relationships.

Check:

- My Assessments
- Students
- Active Assignments
- Shared Resources
- Total Colleges
- Total Batches
- Total Attempts

Do not artificially change dashboard counters.

If there are 20,737 students, the dashboard should derive that count from the database.

If there are 31 colleges, derive 31.

If there are 6,209 batches, derive 6,209.

The UI must never display fake hardcoded statistics.

==================================================
15. DO NOT BREAK EXISTING DATA
==================================================

Before and after generation compare:

- Student count
- College count
- Batch count
- Existing auth users
- Existing resources
- Existing exams
- Existing results

Existing records must remain intact.

Only NEW test records should be added.

Do not delete or modify unrelated records.

==================================================
16. DUPLICATE PROTECTION
==================================================

Create a unique seed identifier for this test generation.

Example:

LMS_HUMAN_WORKFLOW_TEST_2026_08

Before creating:

Check whether this seed already exists.

If it exists:

DO NOT blindly create another complete dataset.

Instead determine what was already created and continue only with missing records.

Avoid duplicate:

- Exams
- Questions
- Resources
- Assignments
- Attempts
- Results

==================================================
17. PERFORMANCE
==================================================

The system contains 20,000+ students.

Do not:

- Load every student into the browser
- Perform N+1 queries
- Make one unnecessary request per student
- Create massive React state
- Render thousands of rows simultaneously
- Freeze the dashboard
- Create uncontrolled concurrent requests

Use batching and existing efficient services.

The final portal must remain responsive.

==================================================
18. ACTUAL UI TESTING
==================================================

After data generation, actually inspect the portal pages.

Verify:

Dashboard
→ correct statistics

Colleges
→ colleges display correctly

Students
→ students display correctly

Batches
→ batches display correctly

Resources
→ 50 new resources appear

Exams
→ 50 new exams appear

Results
→ realistic results appear

Leaderboard
→ generated results influence leaderboard where applicable

Student Dashboard
→ correct exams/resources appear

Student Exam
→ exam can actually be taken

Student Result
→ result is actually generated

Admin/College Admin
→ permissions remain correct

==================================================
19. IMPORTANT: HUMAN-LIKE DATA, NOT DATABASE FAKES
==================================================

The final database should resemble this:

REAL ADMIN ACTION
↓
Exam created
↓
Questions added
↓
Exam assigned
↓
Student sees exam
↓
Student starts exam
↓
Attempt created
↓
Student answers
↓
Student submits
↓
Evaluation executes
↓
Result generated
↓
Dashboard/Results/Leaderboard update

And:

REAL ADMIN ACTION
↓
Resource created
↓
Resource assigned
↓
Student sees resource
↓
Student opens resource

Do not shortcut this by inserting disconnected rows.

If direct seeding is necessary for speed, use the exact same services/functions/business logic used by the application so the resulting records are indistinguishable from manually created records.

==================================================
20. FINAL VERIFICATION REPORT
==================================================

After everything is complete, provide:

EXISTING DATA
Students: X
Colleges: X
Batches: X

NEW EXAMS
Created: 50
Global: X
College/Batch specific: X

EXAM STATES
Draft: X
Scheduled: X
Active: X
Completed: X
Expired: X

NEW RESOURCES
Created: 50
Global: X
College/Batch specific: X

STUDENT ACTIVITY
Eligible students: X
Attempts created: X
Completed attempts: X
Unattempted: X
Students represented: X

RESULTS
Results generated: X
Passed: X
Failed: X

SECURITY TEST
Cross-college access verified: YES/NO
Unauthorized exam access blocked: YES/NO
Unauthorized resource access blocked: YES/NO
Student-to-student result access blocked: YES/NO
Role restrictions verified: YES/NO

INTEGRITY
Broken relationships: 0
Orphan records: 0
Duplicate records: 0
Invalid assignments: 0
Invalid results: 0

PERFORMANCE
Portal remains responsive: YES/NO

If anything fails, identify the exact issue and fix only the affected functionality.

FINAL RULE:

The portal must look and behave as though real administrators, college admins, trainers and students manually performed these operations.

Do not optimize for "making rows exist".

Optimize for:

REAL RELATIONSHIPS
+
REAL AUTHORIZATION
+
REAL ELIGIBILITY
+
REAL ATTEMPTS
+
REAL EVALUATION
+
REAL RESULTS
+
REAL DASHBOARD BEHAVIOR
+
NO BROKEN EXISTING FUNCTIONALITY.





IMPORTANT — ROLE-BASED TESTING WITH THE GENERATED DATA

The generated data is being created specifically so that I can test the portal through the actual UI using different roles.

Therefore, after creating the data, DO NOT stop at database verification.

I must be able to log into the portal as:

1. Global main Admin
2. College Admin
3. Student

and see the appropriate generated data through the actual portal.

--------------------------------------------------
STUDENT LOGIN TEST
--------------------------------------------------

Use existing student authentication/accounts where available.

For students who are assigned to the generated exams/resources:

When I log in as that student, I should actually see:

- Their college
- Their department
- Their batch
- Their section
- Their profile
- Exams assigned to them
- Global exams available to them
- College-specific exams available to them
- Batch-specific exams available to them
- Assigned resources
- Their exam attempts
- Their completed exams
- Their results
- Their scores
- Their leaderboard position where applicable

The student MUST NOT see:

- Exams assigned to another college
- Batch-restricted exams for another batch
- Private resources belonging to another college
- Other students' results
- Admin-only data
- College management pages
- Other college's student information

The student experience must look exactly like a real student using the LMS.

--------------------------------------------------
COLLEGE ADMIN LOGIN TEST
--------------------------------------------------

Use existing college-admin accounts or create appropriate test accounts only through the existing authentication/role system.

For each college admin, associate the account with an existing college.

When I log in as College Admin A:

I should see the generated data belonging to College A according to the existing authorization rules:

- College information
- Students belonging to that college
- Departments
- Batches
- College-specific exams
- Global exams/resources where the existing role is allowed to see them
- Resources assigned to that college
- Student attempts/results that the college admin is authorized to view
- College statistics
- College-level leaderboard/results where supported

College Admin A MUST NOT see restricted data belonging to College B.

Test this using multiple colleges.

Example:

College Admin A
→ College A students visible
→ College A batches visible
→ College A exams visible
→ College A resources visible
→ authorized results visible
→ College B restricted data NOT visible

College Admin B
→ College B data visible
→ College A restricted data NOT visible

--------------------------------------------------
GLOBAL MAIN ADMIN LOGIN TEST
--------------------------------------------------

When logged in as Global Admin, verify that the generated dataset is visible according to the existing Global Admin permissions.

The Global Admin should be able to see appropriate global statistics such as:

- Total students
- Total colleges
- Total batches
- Total exams
- Active assignments
- Resources
- Attempts
- Results

The dashboard statistics must come from the actual database.

Do NOT hardcode the numbers.

--------------------------------------------------
EXAM VISIBILITY TEST
--------------------------------------------------

For every assignment type, test actual visibility.

GLOBAL EXAM:

Student from College A
→ sees it

Student from College B
→ sees it

Student from College C
→ sees it

COLLEGE-SPECIFIC EXAM:

Student from assigned College
→ sees it

Student from another College
→ does NOT see it

BATCH-SPECIFIC EXAM:

Student from assigned batch
→ sees it

Student from another batch
→ does NOT see it

This must be enforced by the existing application authorization/eligibility logic, not merely hidden in the frontend.

--------------------------------------------------
RESOURCE VISIBILITY TEST
--------------------------------------------------

Perform the same verification for resources.

Global resource:
→ eligible students can see it

College resource:
→ students from that college can see it

Batch resource:
→ students from that batch can see it

Unauthorized students:
→ cannot access restricted resources

--------------------------------------------------
RESULT VISIBILITY TEST
--------------------------------------------------

Students should only see their own results.

College Admin should see only results they are authorized to access.

Global Admin should see results according to Global Admin permissions.

A student must never be able to access another student's result simply by changing an ID in the URL or request.

--------------------------------------------------
AUTHENTICATION REQUIREMENT
--------------------------------------------------

The generated test data must be connected to REAL authentication accounts where the portal requires authentication.

Do not create database-only student records that cannot actually log in if the student workflow requires an auth account.

For every generated student test account:

Student Auth Account
↓
Student Profile/Record
↓
College
↓
Department
↓
Batch
↓
Exam Eligibility
↓
Exam Attempt
↓
Result

All relationships must be valid.

Do not create orphan authentication users.

Do not create student records without required authentication where authentication is required.

Do not create authentication users without a valid corresponding student record.

--------------------------------------------------
FINAL MANUAL TEST
--------------------------------------------------

After seeding everything, actually perform representative login tests:

Student from College A
Student from College B
Student from College C
College Admin A
College Admin B
Global Admin

For each account:

LOGIN
↓
Dashboard
↓
Assigned data
↓
Exam visibility
↓
Resource visibility
↓
Attempt exam where applicable
↓
Submit exam
↓
View result
↓
Verify authorization

The final goal is NOT simply:

"50 exams exist in Supabase."

The final goal is:

"I can log into the actual LMS as a real student or college admin and experience the generated data exactly as if those users manually created, received, attempted, and completed the work."

If the generated data exists in Supabase but is not visible through the correct user interface and role, consider the test FAILED and fix the underlying relationship/authorization issue without breaking existing functionality.