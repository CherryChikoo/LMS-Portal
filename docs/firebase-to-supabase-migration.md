# Firebase to Supabase Migration Plan

This document outlines the step-by-step strategy for executing the data and codebase migration from Firebase to Supabase (Phase 2), based on the discovered architecture and target PostgreSQL schema.

## 1. Database Creation (Schema & RLS)
- **Tooling:** We will use `supabase migration new` to generate SQL files in `supabase/migrations/`.
- **Execution:** Create tables, foreign keys, and indexes exactly as outlined in `docs/supabase-schema.md`.
- **Security:** Enable Row Level Security (RLS) on all tables and apply policies that mirror the existing Firestore rules (e.g. `firestore.rules`).

## 2. Authentication Migration
- We will not migrate raw passwords (they are hashed in Firebase).
- **Strategy:** Use the Supabase CLI / GoTrue bulk user import tool to transfer users with their existing password hashes from Firebase Auth.
- Existing custom claims or roles will be synchronized into the `users` table upon import.

## 3. Data Extraction & Transformation (ETL)
We will write a one-off Node.js migration script to pipe data from Firestore to Supabase using the Supabase Service Role Key.

### Transformation Rules:
1. **Preserve IDs:** Insert Firebase Document IDs directly into the Supabase `id` (TEXT) columns.
2. **Denormalization Cleanup:** 
   - When importing `students`, drop the `collegeName` field.
   - When importing `exams` and `exam_results`, drop `collegeName`, `studentName`, `examTitle`, `studentEmail`.
3. **Array Extraction:**
   - Iterate over `students.batchIds` and insert rows into the `student_batches` join table.
   - Iterate over `exams.questions` and insert them into the relational `questions` table, tagging each with its parent `exam_id`.
   - Iterate over `doubts.replies` and insert them into the `doubt_replies` table.
4. **Timestamps:** Convert Firestore `Timestamp` objects to ISO strings or PostgreSQL `TIMESTAMPTZ` before inserting.

## 4. Codebase Refactoring
Once data is migrated, the application must be updated to use Supabase.
- **Dependency Map Strategy:**
  - Update `src/lib/firebase/config.ts` to export a Supabase client instead of Firebase.
  - Refactor `src/lib/firebase/firestore.ts` generic wrappers (`getDocuments`, `addDocument`, etc.) to use Supabase JS syntax (`supabase.from(table).select()`).
  - By maintaining the same wrapper function signatures in `firestore.ts`, we minimize the impact on `src/lib/services/*`.
  - Where joins are newly required (e.g., getting `collegeName` alongside a `student`), update the specific service methods in `student-service.ts` to perform the join in Supabase: `.select('*, colleges(name)')`.
- **Authentication:** Replace `firebase/auth` imports with Supabase Auth session management in `middleware.ts` and `auth-service.ts`.
- **Storage:** Update `src/lib/firebase/storage.ts` to use Supabase Storage API (`supabase.storage.from()`).

## 5. Verification Phase
- Run `check-data.js` and other existing data-integrity scripts (adapted for Supabase) to verify record counts and ID matching.
- Log in locally with a test student account to ensure Auth hash migration was successful.
- Verify that `isAssignedToStudent` logic continues to work with the `targets` JSONB field.
- Remove all `firebase` and `firebase-admin` packages from `package.json` upon successful validation.
