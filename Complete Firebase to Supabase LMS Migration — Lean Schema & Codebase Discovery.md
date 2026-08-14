# Firebase → Supabase LMS Migration

## Mission

Migrate this entire LMS application from Firebase to Supabase.

I **do not know the current database architecture or schema**.

You must discover it yourself by thoroughly inspecting the codebase and, where access is available, inspecting the actual Firebase project/data.

The migration must be:

- Complete
- Safe
- Minimal
- Storage-efficient
- Query-efficient
- Write-efficient
- Delete-efficient
- Secure
- Production-ready
- Easy to maintain

## Most Important Rule

**Do not invent an LMS database architecture.**

The existing application and its actual Firebase data are the source of truth.

The job is:

```text
Discover existing architecture
        ↓
Understand actual Firebase data
        ↓
Understand how the application reads/writes it
        ↓
Design the smallest sensible PostgreSQL schema
        ↓
Migrate data
        ↓
Replace Firebase throughout the codebase
        ↓
Optimize
        ↓
Validate
```

Do **not** start by designing tables.

---

# 1. Phase 1 — Complete Codebase Discovery

Before changing any code, scan the entire repository recursively.

Do not only inspect obvious files.

Inspect:

- frontend
- backend
- API routes
- server actions
- server components
- client components
- hooks
- services
- repositories
- utilities
- authentication
- middleware
- database code
- Firebase configuration
- Firebase rules
- Firebase functions
- storage logic
- tests
- seed scripts
- migration scripts
- environment files
- deployment configuration
- CI/CD
- package manifests
- lockfiles
- documentation

Search globally for Firebase usage.

Search for at least:

```text
firebase
firebase-admin
@firebase
firestore
getFirestore
initializeApp
collection
collectionGroup
doc
getDoc
getDocs
addDoc
setDoc
updateDoc
deleteDoc
writeBatch
runTransaction
where
orderBy
limit
startAfter
startAt
endBefore
endAt
onSnapshot
serverTimestamp
Timestamp
arrayUnion
arrayRemove
increment
getAuth
onAuthStateChanged
signInWithEmailAndPassword
createUserWithEmailAndPassword
signOut
getStorage
uploadBytes
uploadBytesResumable
getDownloadURL
deleteObject
httpsCallable
functions
```

Also search for Firebase configuration:

```text
FIREBASE_
NEXT_PUBLIC_FIREBASE_
GOOGLE_APPLICATION_CREDENTIALS
apiKey
authDomain
projectId
storageBucket
messagingSenderId
appId
measurementId
```

Inspect if present:

```text
firebase.json
firestore.rules
firestore.indexes.json
storage.rules
```

---

# 2. Build a Firebase Dependency Map

Create an internal map of every Firebase dependency.

For every usage record:

```text
File
Function/component
Firebase service
Firebase operation
Collection/path
Purpose
Input
Output
Authentication requirement
Authorization requirement
Replacement
Migration status
```

Example:

```text
src/services/course.ts
getCourse()
Firestore
courses/{courseId}
Reads course details
Authenticated
Student/instructor dependent
PostgreSQL query
Pending
```

Do this for the **entire codebase**.

---

# 3. Discover the Actual Data Architecture

I do not know the current schema.

You must determine it.

Use all available evidence:

### Code

Inspect:

- Firestore collection paths
- document paths
- document IDs
- subcollections
- object structures
- arrays
- references
- timestamps
- query filters
- sorting
- pagination
- writes
- updates
- deletes
- transactions
- batch writes

### Types

Inspect:

- TypeScript interfaces
- types
- Zod schemas
- validation schemas
- DTOs
- API response types
- form models

### Security

Inspect:

- Firestore security rules
- Storage rules
- authorization utilities
- role checks
- middleware

### Actual Firebase data

If Firebase credentials/configuration or a Firebase integration is available, inspect the actual Firebase project.

Do not infer the production schema solely from TypeScript types if the actual database can be inspected.

---

# 4. Produce a Discovered Schema Before Designing the New Schema

First produce a representation of what actually exists.

For every collection identify:

```text
Collection
Document structure
Fields
Types
Required/optional fields
Nested objects
Arrays
References
Subcollections
Approximate record count if available
Main queries
Main writes
Main updates
Main deletes
```

Example:

```text
Collection: courses

Fields:
- title
- description
- instructorId
- thumbnail
- status
- createdAt

Used by:
- course listing
- course details
- instructor dashboard

Queries:
- status = published
- instructorId = current user
- order by createdAt
```

This is an example only.

**Do not create a ****`courses`**** table unless the actual application contains such data.**

---

# 5. Discover Relationships

Determine relationships from actual data and code.

Identify:

```text
one-to-one
one-to-many
many-to-many
references
ownership
parent-child relationships
```

For example:

```text
course
   ↓
lessons
```

may become:

```text
courses
lessons
```

with:

```text
lessons.course_id
```

But only do this if the relationship actually exists.

Do not invent relationships.

---

# 6. Identify Firestore-Specific Denormalization

Firestore often contains duplicated data because relational joins were unavailable or inconvenient.

Find duplicated fields.

For example:

```text
studentId
studentName
studentAvatar
```

appearing repeatedly.

Determine:

1. Is the duplicated data actually required?
2. Is it duplicated only for Firestore read performance?
3. Can PostgreSQL replace the duplication with a relationship?
4. Would removing the duplication materially reduce storage?
5. Would the resulting query still be efficient?

Remove duplication when PostgreSQL can represent the same information efficiently.

But do not remove duplication blindly.

If a duplicated value is intentionally used for historical correctness, preserve it.

---

# 7. Design the Smallest Possible PostgreSQL Schema

Only after discovering the actual Firebase architecture should you design the PostgreSQL schema.

## Hard rule

For every table, answer:

> Which actual Firebase collection/subcollection or existing application data requires this table?

If there is no answer:

**Do not create the table.**

For every column:

> Where does this value currently exist?

If there is no answer:

**Do not create the column.**

For every index:

> Which actual query requires this index?

If there is no answer:

**Do not create the index.**

---

# 8. Do Not Over-Engineer

Do NOT automatically create:

```text
organizations
teams
permissions
roles
role_permissions
audit_logs
activity_logs
settings
metadata
notifications
subscriptions
payments
orders
certificates
reviews
analytics
events
```

unless they actually exist in the current application/data.

This is a migration, not a new LMS design.

---

# 9. Avoid Table Explosion

Do not turn every Firestore object into a table.

For example, if the actual data contains:

```json
{
  "settings": {
    "autoplay": true,
    "allowDownload": false
  }
}
```

do not automatically create:

```text
settings
setting_values
setting_options
```

A small, rarely queried object may remain a PostgreSQL `JSONB` column if that is the most storage-efficient and maintainable representation.

---

# 10. Use Relational Tables Where Relationships Matter

Use normal PostgreSQL columns/tables for data that is:

- frequently queried
- filtered
- sorted
- joined
- constrained
- referenced
- independently updated

Example:

```text
user_id
course_id
lesson_id
status
created_at
```

should normally be relational fields.

Do not put frequently queried relationships into JSONB.

---

# 11. Use JSONB Carefully

JSONB is allowed only where it provides a real benefit.

Good candidates:

```text
small flexible configuration
optional metadata
provider-specific payloads
rarely queried nested settings
```

Bad candidates:

```text
user_id
course_id
lesson_id
status
created_at
price
```

Do not use JSONB as a shortcut for avoiding proper schema design.

---

# 12. Minimize Stored Data

The target schema should minimize:

- duplicated data
- unnecessary columns
- unnecessary metadata
- unnecessary indexes
- unnecessary JSON
- unnecessary IDs
- unnecessary storage references

Do not add fields such as:

```text
created_by
updated_by
deleted_by
version
revision
tenant_id
organization_id
slug
metadata
deleted_at
```

unless the existing application actually needs them.

---

# 13. Primary Keys

Choose a simple primary-key strategy.

Prefer using the existing Firebase document ID where practical if preserving IDs simplifies migration.

Otherwise use PostgreSQL-generated UUIDs when appropriate.

Do not create multiple IDs for the same record without a concrete requirement.

Avoid unnecessary:

```text
id
firebase_id
document_id
external_id
```

combinations.

---

# 14. Foreign Keys

Where Firebase data contains actual relationships, use PostgreSQL foreign keys.

Example:

```sql
course_id uuid references courses(id)
```

Use constraints to protect data integrity.

Do not create foreign keys for unrelated strings.

---

# 15. Data Types

Choose compact, appropriate PostgreSQL types.

Use:

```text
BOOLEAN
INTEGER
BIGINT
NUMERIC
TEXT
TIMESTAMPTZ
UUID
JSONB
```

only where appropriate.

Do not use oversized types unnecessarily.

Do not convert everything to `TEXT`.

Do not convert every Firebase object to JSONB.

---

# 16. Timestamp Migration

Convert Firebase timestamps into PostgreSQL timestamps appropriately.

Prefer:

```text
TIMESTAMPTZ
```

for application timestamps.

Preserve the original timestamp meaning.

Do not silently change timezone semantics.

---

# 17. Arrays

Analyze every Firebase array individually.

### Small non-relational arrays

Potentially use:

```text
TEXT[]
```

or JSONB.

### Relational arrays

For example:

```text
studentIds
courseIds
lessonIds
```

should generally become relationship tables if the application needs to query those relationships independently.

Do not store large relational datasets as JSON.

---

# 18. Index Strategy

Indexes must be **minimal and evidence-based**.

Do not index every column.

Every index consumes storage and adds write overhead.

For each proposed index document:

```text
Index
Query using it
Why it helps
Why the additional storage is justified
```

Only create indexes based on:

- actual queries
- actual filters
- actual sorting
- actual joins
- foreign-key lookups
- RLS policy conditions

Supabase recommends indexing columns used by RLS policies when appropriate because RLS itself participates in query evaluation.

---

# 19. Avoid Redundant Indexes

Before adding an index, inspect existing indexes.

Do not create multiple overlapping indexes without evidence.

For example, don't blindly create:

```text
user_id
user_id + created_at
user_id + status
user_id + status + created_at
```

Analyze the actual query patterns first.

Prefer the smallest index set that covers the important workload.

---

# 20. Query Design

For every important Firebase query, create the PostgreSQL equivalent.

Document:

```text
Old Firebase query
New SQL/ORM query
Required index
Expected result
```

Optimize for:

- minimal rows scanned
- minimal columns returned
- minimal network payload
- minimal number of database round trips

Avoid:

```sql
SELECT *
```

when the application only requires a subset of fields.

---

# 21. Read Optimization

Optimize the actual high-frequency reads.

Find the application's most common operations.

Examples might include:

```text
course listing
course details
lesson loading
student dashboard
instructor dashboard
progress
enrollment
notifications
search
```

These are examples only.

Use the actual application's workload.

---

# 22. Write Optimization

Find all:

```text
setDoc
addDoc
updateDoc
writeBatch
runTransaction
increment
```

usage.

Determine the actual write semantics.

Use PostgreSQL transactions when multiple operations must be atomic.

Use bulk operations where the application currently performs many independent writes.

Do not introduce unnecessary triggers or database functions.

---

# 23. Delete Optimization

Inspect every Firebase delete operation.

Determine whether the current behavior is:

```text
hard delete
soft delete
cascade
manual cleanup
```

Preserve the intended behavior.

Use:

```text
ON DELETE CASCADE
ON DELETE SET NULL
ON DELETE RESTRICT
```

only where the application's existing semantics justify it.

Do not automatically implement soft deletes.

---

# 24. Firestore Transactions

Find all Firebase transactions.

For every transaction determine:

```text
records involved
reason transaction exists
concurrency requirements
business invariant
```

Convert the transaction into an appropriate PostgreSQL transaction.

Do not reproduce Firebase transaction complexity if PostgreSQL constraints or a simpler atomic operation can solve the same problem.

---

# 25. Firestore Batch Writes

Find all batch writes.

Determine whether they are:

- truly atomic
- simply bulk operations
- independent writes grouped for convenience

Use PostgreSQL bulk operations or transactions accordingly.

Do not wrap every batch operation in a transaction automatically.

---

# 26. Counters

Find all uses of:

```text
increment()
```

Determine whether each counter should be:

1. calculated dynamically
2. stored
3. maintained transactionally

If the value is cheap to calculate and not frequently displayed, prefer calculating it.

If the value is expensive and frequently read, a stored counter may be justified.

Do not retain redundant counters automatically.

---

# 27. Authentication

Replace Firebase Authentication with Supabase Auth.

Inspect the current authentication implementation first.

Identify:

```text
email/password
OAuth
Google
GitHub
email verification
password reset
sessions
refresh
protected routes
roles
custom claims
```

Only migrate features that actually exist.

Use Supabase Auth as the identity layer.

Do not duplicate passwords or authentication credentials in PostgreSQL.

---

# 28. User Data

If Firebase currently has user/profile data, map it carefully.

Use:

```text
auth.users
```

for authentication identity.

Create an application profile table only if the application currently stores profile/application data.

Do not create a complex user-management system unnecessarily.

---

# 29. Authorization

Read the existing Firebase security rules and application authorization logic.

For every rule determine:

```text
who
can perform what
on which data
under which condition
```

Then reproduce that behavior using Supabase/PostgreSQL RLS where appropriate.

Supabase recommends RLS for protecting tables exposed through its API.

Do not weaken security during migration.

---

# 30. RLS

For every client-accessible table:

1. Determine whether RLS is required.
2. Enable RLS where appropriate.
3. Create policies matching the existing Firebase authorization behavior.
4. Test the policies.

Do not use broad policies such as:

```sql
USING (true)
```

for private application data.

Do not use service-role credentials in browser/client code.

---

# 31. RLS Performance

When an RLS policy checks a column such as:

```text
user_id
owner_id
course_id
organization_id
```

evaluate whether that column requires an index.

Also ensure application queries provide useful filters rather than relying entirely on RLS to filter large datasets.

Supabase explicitly recommends adding filters to queries and indexing columns involved in RLS policies where appropriate.

---

# 32. Firebase Storage

Find every Firebase Storage usage.

Determine:

```text
files
buckets
paths
upload behavior
download behavior
public/private access
signed URLs
deletion
ownership
```

Move the actual file objects to Supabase Storage.

Do not put file contents inside PostgreSQL.

---

# 33. Minimize File Metadata

Do not duplicate Storage metadata unnecessarily inside application tables.

Prefer storing only the application-specific reference/path required by the application.

Do not store all of:

```text
file_url
signed_url
bucket
path
filename
mime_type
size
storage_id
```

unless the application genuinely needs those values.

Signed URLs are temporary and generally should not be persisted as permanent database data.

---

# 34. Storage Buckets

Create only the buckets required by the existing application.

Do not invent buckets for hypothetical future features.

Example:

```text
avatars
course-assets
```

only if those are actually required.

Keep storage structure simple.

---

# 35. Firebase Realtime

Find all:

```text
onSnapshot
listeners
realtime subscriptions
```

Determine whether each feature actually requires realtime updates.

If a normal database query is sufficient, use a normal query.

Only use Supabase Realtime where live updates are genuinely part of the application's behavior.

---

# 36. Firebase Cloud Functions

Inspect every Firebase Function.

For each function document:

```text
trigger
input
output
database operations
external integrations
schedule
side effects
authentication
```

Then determine whether it should become:

```text
Supabase Edge Function
database function
existing server code
cron job
worker
```

or simply be removed because it is no longer needed.

Do not migrate obsolete functions.

---

# 37. ORM

Use one primary database access approach.

If the project already uses an ORM, evaluate whether it should be retained.

If not, choose one appropriate PostgreSQL ORM/query layer.

Do not introduce unnecessary layers.

Preferred architecture:

```text
UI/API
   ↓
Application service/data access
   ↓
ORM/query layer
   ↓
PostgreSQL
```

Keep database access understandable.

---

# 38. SQL Performance

For important queries:

```text
inspect generated SQL
EXPLAIN
EXPLAIN ANALYZE
```

where practical.

Look for:

```text
sequential scans
N+1 queries
unnecessary joins
large result sets
unnecessary sorting
missing indexes
redundant indexes
over-fetching
```

Do not optimize theoretical queries that are not actually used.

---

# 39. Pagination

Inspect existing Firestore pagination.

If the application handles large datasets, use PostgreSQL cursor/keyset pagination where appropriate.

Do not introduce complex pagination for small datasets.

Prefer stable ordering.

---

# 40. Search

Inspect the current search implementation.

If simple filtering is sufficient, keep it simple.

If PostgreSQL can handle the existing search workload, use PostgreSQL.

Do not introduce Elasticsearch, Algolia, Typesense, or another search system unless the current application genuinely requires it.

---

# 41. Caching

Do not introduce Redis or another caching layer automatically.

First optimize:

```text
schema
query
indexes
payload
round trips
```

Only introduce caching if actual measurements demonstrate that it is necessary.

---

# 42. Database Migrations

Use version-controlled Supabase migrations.

The database must be reproducible from code.

Use:

```text
supabase/migrations/
```

for schema changes.

Supabase's documented workflow uses migrations to track database changes and supports testing them locally with database resets before deployment.

Do not rely on manually configuring the production database.

---

# 43. Data Migration

Create a repeatable migration process:

```text
Firebase
   ↓
Extract
   ↓
Transform only when necessary
   ↓
Load
   ↓
Validate
```

Preserve:

- IDs
- timestamps
- relationships
- meaningful historical data
- application behavior

Do not transform data merely for aesthetic reasons.

---

# 44. Migration Validation

After importing the data, compare Firebase and PostgreSQL.

Validate:

```text
record counts
IDs
relationships
required fields
timestamps
arrays
nested data
references
storage objects
```

Detect:

```text
missing records
duplicate records
orphan records
invalid references
missing files
incorrect values
```

The migration should fail clearly when integrity checks fail.

---

# 45. Codebase Migration

Once the new schema is finalized, migrate the entire application.

Replace Firebase database operations with Supabase/PostgreSQL operations.

Replace Firebase authentication with Supabase Auth.

Replace Firebase Storage with Supabase Storage.

Replace Firebase realtime where required.

Replace Firebase Functions where required.

Update:

- imports
- services
- repositories
- hooks
- API routes
- server actions
- middleware
- auth guards
- tests
- types
- environment variables

---

# 46. Preserve Application Behavior

Do not unnecessarily rewrite the frontend.

If the application currently expects:

```text
course.title
course.lessons
course.instructor
```

maintain compatible application-level objects where practical.

The backend migration should not create unnecessary UI work.

---

# 47. Environment Variables

Remove Firebase environment variables after migration.

Add only the Supabase variables actually required by the project.

Typical examples:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Use the project's actual framework naming conventions.

The service-role key must remain server-side only.

---

# 48. Remove Firebase

After the migration, run the repository scan again.

Search for:

```text
firebase
firebase-admin
@firebase
firestore
getFirestore
getAuth
getStorage
onSnapshot
initializeApp
FirebaseError
```

Also inspect:

```text
package.json
lockfile
.env
.env.example
CI/CD
deployment configuration
build configuration
```

Remove unused Firebase packages and configuration.

If anything intentionally remains, document exactly why.

---

# 49. Testing

Test:

### Authentication

```text
login
logout
signup
session persistence
password reset
OAuth if used
```

### Data

```text
create
read
update
delete
pagination
relationships
```

### LMS behavior

Test the actual features discovered during the audit.

Do not create tests for features that do not exist.

### Security

Test:

```text
unauthenticated access
student access
instructor access
admin access
cross-user access
cross-owner access
```

---

# 50. Performance Validation

Measure actual important operations.

For each major operation record:

```text
query
rows involved
execution time
index used
payload size
number of DB calls
```

Focus on actual high-traffic operations.

Do not optimize everything equally.

---

# 51. Storage Validation

Calculate:

```text
Firebase data size
PostgreSQL data size
PostgreSQL index size
Storage object size
```

Identify unnecessary duplication.

The target is not merely "PostgreSQL works."

The target is:

```text
minimum reasonable storage
+
efficient reads
+
efficient writes
+
efficient deletes
```

---

# 52. Final Schema Review

Before finalizing the migration, perform a schema review.

For every table:

```text
Why does this table exist?
```

For every column:

```text
Why does this column exist?
```

For every index:

```text
Which actual query requires this?
```

For every JSONB field:

```text
Why is this not relational?
```

For every foreign key:

```text
What real relationship does this represent?
```

For every trigger/function:

```text
Why is this necessary?
```

For every external service:

```text
Why can't the existing application/Supabase/PostgreSQL handle this?
```

Remove anything that cannot be justified.

---

# 53. Required Documentation

Create:

```text
docs/firebase-discovered-architecture.md
docs/supabase-schema.md
docs/firebase-to-supabase-migration.md
```

## `firebase-discovered-architecture.md`

Document what was actually discovered.

Include:

```text
Firebase collections
subcollections
fields
relationships
queries
writes
deletes
auth
storage
functions
realtime
security rules
```

## `supabase-schema.md`

Document only the final schema.

Include:

```text
tables
columns
relationships
indexes
RLS
storage
important queries
```

## `firebase-to-supabase-migration.md`

Document:

```text
migration preparation
schema creation
data migration
validation
environment changes
deployment
rollback
post-migration verification
```

---

# 54. Required Deliverables

Produce:

```text
1. Complete Firebase audit
2. Discovered data architecture
3. Lean PostgreSQL schema
4. ORM schema
5. Supabase migrations
6. Firebase → PostgreSQL data migration
7. Data validation tooling
8. RLS policies
9. Storage policies
10. Updated application code
11. Updated authentication
12. Updated storage integration
13. Updated realtime/functions where required
14. Updated tests
15. Updated environment configuration
16. Migration documentation
```

---

# 55. Do Not Do These Things

Do NOT:

- invent domain tables
- invent business features
- redesign the LMS unnecessarily
- normalize everything
- put everything into JSONB
- create an index for every field
- create multiple redundant IDs
- add metadata everywhere
- add audit tables automatically
- add soft deletes automatically
- add caching automatically
- add Redis automatically
- add a search engine automatically
- add realtime automatically
- add database triggers automatically
- add database functions automatically
- migrate unused Firebase Functions
- preserve Firestore denormalization without analysis
- expose Supabase service-role credentials
- disable RLS just to make the migration easier
- rewrite unrelated application functionality

---

# 56. Decision Hierarchy

When making an architectural decision, use this priority:

```text
1. Existing application behavior
2. Actual Firebase data
3. Existing security requirements
4. Actual query patterns
5. Data integrity
6. Storage efficiency
7. Read performance
8. Write performance
9. Delete performance
10. Maintainability
```

Do not prioritize theoretical database design over actual application requirements.

---

# 57. The "Minimum Necessary Schema" Rule

The final PostgreSQL schema should contain:

```text
ONLY
│
├── data that actually exists
│
├── relationships that actually exist
│
├── fields required by the application
│
├── constraints required for integrity
│
└── indexes required by real queries/RLS
```

Nothing else.

---

# 58. Migration Execution Order

Execute in this exact conceptual order:

```text
PHASE 1
Scan repository
        ↓
PHASE 2
Discover Firebase architecture
        ↓
PHASE 3
Inspect actual Firebase data if available
        ↓
PHASE 4
Map collections → entities
        ↓
PHASE 5
Analyze relationships
        ↓
PHASE 6
Analyze denormalization
        ↓
PHASE 7
Analyze reads/writes/deletes
        ↓
PHASE 8
Design minimum PostgreSQL schema
        ↓
PHASE 9
Design minimum index set
        ↓
PHASE 10
Design RLS
        ↓
PHASE 11
Review and simplify schema
        ↓
PHASE 12
Create migrations
        ↓
PHASE 13
Create data migration
        ↓
PHASE 14
Migrate Auth
        ↓
PHASE 15
Migrate Storage
        ↓
PHASE 16
Migrate application code
        ↓
PHASE 17
Migrate realtime/functions if required
        ↓
PHASE 18
Run data validation
        ↓
PHASE 19
Run security tests
        ↓
PHASE 20
Run performance tests
        ↓
PHASE 21
Remove Firebase
        ↓
PHASE 22
Final full repository scan
```

---

# 59. Final Acceptance Criteria

The migration is complete only when:

- [ ] The entire repository has been scanned.
- [ ] The current Firebase architecture has been discovered.
- [ ] The actual Firebase schema has been identified where access is available.
- [ ] Collections and subcollections are documented.
- [ ] Actual fields are documented.
- [ ] Actual relationships are documented.
- [ ] Actual queries are documented.
- [ ] Actual writes are documented.
- [ ] Actual deletes are documented.
- [ ] Firebase security rules have been analyzed.
- [ ] Firebase Storage usage has been analyzed.
- [ ] Firebase Functions have been analyzed.
- [ ] Firebase realtime usage has been analyzed.
- [ ] A minimal PostgreSQL schema has been designed.
- [ ] Every table has a concrete justification.
- [ ] Every column has a concrete justification.
- [ ] Every index has a concrete query/RLS justification.
- [ ] Firestore-only denormalization has been removed where appropriate.
- [ ] Unnecessary duplicated data has been eliminated.
- [ ] JSONB is used only where justified.
- [ ] Storage metadata is not unnecessarily duplicated.
- [ ] Foreign keys represent actual relationships.
- [ ] Delete behavior is intentional.
- [ ] Authentication has been migrated.
- [ ] RLS policies reproduce the required authorization behavior.
- [ ] Storage policies reproduce the required access behavior.
- [ ] Service-role credentials are server-only.
- [ ] Data has been migrated.
- [ ] Migrated data has been validated.
- [ ] Application code no longer depends on Firebase unless explicitly documented.
- [ ] Major queries have been performance-tested.
- [ ] N+1 access patterns have been reviewed.
- [ ] Redundant indexes have been removed.
- [ ] Unnecessary tables/columns have been removed.
- [ ] Tests pass.
- [ ] Documentation is complete.
- [ ] Firebase packages/configuration have been removed where no longer required.

---

# 60. Final Instruction to the Coding Agent

**Do not guess the database architecture. Discover it.**

I do not know:

- what collections exist
- what fields exist
- what relationships exist
- what Firebase services are actually being used
- what data is duplicated
- what queries are important
- what indexes are needed
- what the optimal PostgreSQL schema should be

You are responsible for discovering all of that from the repository and available Firebase data.

The migration should follow:

```text
UNKNOWN CURRENT ARCHITECTURE
            ↓
     COMPLETE DISCOVERY
            ↓
    ACTUAL DATA MODEL
            ↓
    ACTUAL ACCESS PATTERNS
            ↓
   MINIMAL SQL SCHEMA
            ↓
   MINIMAL INDEX STRATEGY
            ↓
       RLS + AUTH
            ↓
    DATA MIGRATION
            ↓
    CODE MIGRATION
            ↓
 PERFORMANCE + STORAGE REVIEW
            ↓
       FINAL CLEANUP
```

### The final result must NOT be the biggest or most sophisticated schema.

It must be the **smallest schema that accurately represents the existing application, preserves its behavior, protects its data, and performs efficiently at its actual workload**.

When in doubt:

**Inspect first. Measure second. Design third. Optimize fourth.**

Never invent data architecture merely because it is common in LMS applications.
