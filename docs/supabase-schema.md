# Supabase (PostgreSQL) Target Schema

This schema is designed based *strictly* on the discovered Firebase architecture. We are applying PostgreSQL relational normalization only where it directly improves data integrity, query performance, and storage efficiency.

## Overview of Changes from Firebase
1. **Denormalization Removed:** `collegeName`, `studentName`, and `examTitle` are dropped from dependent tables. They will be resolved at query time using standard `JOIN`s or Supabase ORM (PostgREST) nested resource queries.
2. **Foreign Keys Added:** Hard relational constraints are added between `students -> colleges`, `exams -> colleges`, and `exam_results -> exams`.
3. **Primary Keys:** The existing string-based Firebase IDs (e.g. Auth UIDs, custom ID generators) will be preserved in the `id` column using `TEXT PRIMARY KEY` to ensure zero disruption to historical data and deep links.

---

## Tables & Relationships

### `colleges`
- `id`: TEXT PRIMARY KEY (preserves Firebase ID)
- `name`: TEXT NOT NULL
- `type`: TEXT (official, external)
- `code`: TEXT NOT NULL
- `departments`: TEXT[] (Array type)
- `location`: TEXT
- `student_count`: INTEGER DEFAULT 0
- `admin_email`: TEXT
- `status`: TEXT
- `branding`: JSONB (Stores companyName, companySubtitle, logoBase64)
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()
- `deleted_at`: TIMESTAMPTZ
- `is_deleted`: BOOLEAN DEFAULT false

### `users`
*(Ties to `auth.users` under the hood. Stores roles for RLS.)*
- `id`: TEXT PRIMARY KEY REFERENCES `auth.users(id)`
- `email`: TEXT NOT NULL UNIQUE
- `display_name`: TEXT NOT NULL
- `role`: TEXT NOT NULL
- `college_id`: TEXT REFERENCES `colleges(id)`
- `status`: TEXT
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()

### `batches`
- `id`: TEXT PRIMARY KEY
- `college_id`: TEXT REFERENCES `colleges(id)` NOT NULL
- `name`: TEXT NOT NULL
- `description`: TEXT
- `department`: TEXT
- `academic_year`: TEXT
- `section`: TEXT
- `status`: TEXT DEFAULT 'active'
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()

### `students`
*(One-to-One with `users`, but extended profile)*
- `id`: TEXT PRIMARY KEY REFERENCES `users(id)`
- `college_id`: TEXT REFERENCES `colleges(id)` NOT NULL
- `phone`: TEXT
- `department`: TEXT
- `academic_year`: TEXT
- `semester`: INTEGER
- `section`: TEXT
- `roll_number`: TEXT
- `enrollment_no`: TEXT
- `must_change_password`: BOOLEAN DEFAULT true
- `enrollment_type`: TEXT
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()

### `student_batches` (Join Table)
*(Replacing the `batchIds: string[]` and `studentIds: string[]` arrays)*
- `student_id`: TEXT REFERENCES `students(id)` ON DELETE CASCADE
- `batch_id`: TEXT REFERENCES `batches(id)` ON DELETE CASCADE
- PRIMARY KEY (`student_id`, `batch_id`)

### `exams`
- `id`: TEXT PRIMARY KEY
- `college_id`: TEXT REFERENCES `colleges(id)` NOT NULL
- `title`: TEXT NOT NULL
- `description`: TEXT
- `duration_minutes`: INTEGER NOT NULL
- `total_marks`: INTEGER NOT NULL
- `passing_marks`: INTEGER
- `status`: TEXT NOT NULL
- `targets`: JSONB *(Preserved as JSONB due to polymorphic multi-level targeting logic)*
- `settings`: JSONB *(Preserved as JSONB for flexible UI config)*
- `scheduled_at`: TIMESTAMPTZ
- `start_time`: TIMESTAMPTZ
- `end_time`: TIMESTAMPTZ
- `created_by`: TEXT REFERENCES `users(id)`
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()
- `deleted_at`: TIMESTAMPTZ

### `questions`
*(Extracted from the embedded array inside Firebase `exams` document)*
- `id`: TEXT PRIMARY KEY
- `exam_id`: TEXT REFERENCES `exams(id)` ON DELETE CASCADE
- `text`: TEXT NOT NULL
- `type`: TEXT NOT NULL
- `options`: TEXT[]
- `correct_answer`: JSONB *(Handles string or array of strings)*
- `marks`: INTEGER NOT NULL
- `explanation`: TEXT
- `ai_explanation`: JSONB
- `subject`: TEXT
- `topic`: TEXT
- `difficulty`: TEXT
- `sort_order`: INTEGER NOT NULL
- `created_at`: TIMESTAMPTZ DEFAULT NOW()

### `exam_results`
- `id`: TEXT PRIMARY KEY
- `exam_id`: TEXT REFERENCES `exams(id)` ON DELETE CASCADE
- `student_id`: TEXT REFERENCES `students(id)` ON DELETE CASCADE
- `score`: INTEGER NOT NULL DEFAULT 0
- `total_marks`: INTEGER NOT NULL
- `percentage`: NUMERIC(5,2)
- `passed`: BOOLEAN
- `status`: TEXT NOT NULL
- `correct_count`: INTEGER
- `incorrect_count`: INTEGER
- `answers`: JSONB *(Map of question_id to selected answer)*
- `ai_summary`: JSONB
- `time_taken_minutes`: INTEGER
- `start_time`: TIMESTAMPTZ
- `submitted_at`: TIMESTAMPTZ
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()

### `resources`
- `id`: TEXT PRIMARY KEY
- `college_id`: TEXT REFERENCES `colleges(id)` ON DELETE CASCADE
- `title`: TEXT NOT NULL
- `type`: TEXT NOT NULL
- `url`: TEXT NOT NULL
- `category`: TEXT
- `tags`: TEXT[]
- `targets`: JSONB
- `created_by`: TEXT REFERENCES `users(id)`
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()

### `doubts`
- `id`: TEXT PRIMARY KEY
- `student_id`: TEXT REFERENCES `students(id)` ON DELETE CASCADE
- `college_id`: TEXT REFERENCES `colleges(id)`
- `resource_id`: TEXT REFERENCES `resources(id)` ON DELETE SET NULL
- `subject`: TEXT NOT NULL
- `topic`: TEXT
- `question`: TEXT NOT NULL
- `status`: TEXT DEFAULT 'open'
- `created_at`: TIMESTAMPTZ DEFAULT NOW()
- `updated_at`: TIMESTAMPTZ DEFAULT NOW()

### `doubt_replies`
*(Extracted from the embedded `replies` array)*
- `id`: TEXT PRIMARY KEY
- `doubt_id`: TEXT REFERENCES `doubts(id)` ON DELETE CASCADE
- `author_id`: TEXT REFERENCES `users(id)`
- `role`: TEXT
- `text`: TEXT NOT NULL
- `created_at`: TIMESTAMPTZ DEFAULT NOW()

### `trainer_notes`
- `id`: TEXT PRIMARY KEY
- `student_id`: TEXT REFERENCES `students(id)` ON DELETE CASCADE
- `author_name`: TEXT
- `text`: TEXT NOT NULL
- `created_at`: TIMESTAMPTZ DEFAULT NOW()

---

## Required Indexes

Based on the actual queries discovered in Phase 1:
1. `CREATE INDEX idx_users_college ON users(college_id);`
2. `CREATE INDEX idx_students_college ON students(college_id);`
3. `CREATE INDEX idx_batches_college ON batches(college_id);`
4. `CREATE INDEX idx_exams_college ON exams(college_id);`
5. `CREATE INDEX idx_exam_results_exam ON exam_results(exam_id);`
6. `CREATE INDEX idx_exam_results_student ON exam_results(student_id);`
7. `CREATE INDEX idx_resources_college ON resources(college_id);`
8. `CREATE INDEX idx_trainer_notes_student ON trainer_notes(student_id);`

## Row Level Security (RLS) Strategy

- **Colleges:** Admins can read all; students/trainers read their own `college_id`.
- **Students/Users:** Users read their own profile; trainers/admins can read based on `college_id`.
- **Exams/Resources:** Accessible if the target JSONB matches the student's batches/details, or if they are in the same college (based on assignment logic).
- **Exam Results:** Students can only SELECT/INSERT their own results (`auth.uid() = student_id`). Admins can read all for their college.
