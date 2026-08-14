-- Clean up previous failed attempts
DROP TABLE IF EXISTS public.doubt_replies CASCADE;
DROP TABLE IF EXISTS public.doubts CASCADE;
DROP TABLE IF EXISTS public.trainer_notes CASCADE;
DROP TABLE IF EXISTS public.resources CASCADE;
DROP TABLE IF EXISTS public.exam_results CASCADE;
DROP TABLE IF EXISTS public.questions CASCADE;
DROP TABLE IF EXISTS public.exams CASCADE;
DROP TABLE IF EXISTS public.student_batches CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;
DROP TABLE IF EXISTS public.batches CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.colleges CASCADE;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: colleges
CREATE TABLE public.colleges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    code TEXT NOT NULL,
    departments TEXT[],
    location TEXT,
    student_count INTEGER DEFAULT 0,
    admin_email TEXT,
    status TEXT,
    branding JSONB,
    origin TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT false
);

-- Table: users 
-- Note: Firebase Auth UIDs are 28 chars TEXT. We cannot reference auth.users(id) which is UUID directly without a mapping table.
-- We preserve Firebase UIDs here.
CREATE TABLE public.users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    college_id TEXT REFERENCES public.colleges(id) ON DELETE SET NULL,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: batches
CREATE TABLE public.batches (
    id TEXT PRIMARY KEY,
    college_id TEXT REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    department TEXT,
    academic_year TEXT,
    section TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: students (profile extension for student role)
CREATE TABLE public.students (
    id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    college_id TEXT REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    phone TEXT,
    department TEXT,
    academic_year TEXT,
    semester INTEGER,
    section TEXT,
    roll_number TEXT,
    enrollment_no TEXT,
    must_change_password BOOLEAN DEFAULT true,
    enrollment_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Join Table: student_batches
CREATE TABLE public.student_batches (
    student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES public.batches(id) ON DELETE CASCADE,
    PRIMARY KEY (student_id, batch_id)
);

-- Table: exams
CREATE TABLE public.exams (
    id TEXT PRIMARY KEY,
    college_id TEXT REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    total_marks INTEGER NOT NULL,
    passing_marks INTEGER,
    status TEXT NOT NULL,
    targets JSONB,
    settings JSONB,
    scheduled_at TIMESTAMPTZ,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Table: questions
CREATE TABLE public.questions (
    id TEXT PRIMARY KEY,
    exam_id TEXT REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    options TEXT[],
    correct_answer JSONB,
    marks INTEGER NOT NULL,
    explanation TEXT,
    ai_explanation JSONB,
    subject TEXT,
    topic TEXT,
    difficulty TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: exam_results
CREATE TABLE public.exam_results (
    id TEXT PRIMARY KEY,
    exam_id TEXT REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
    student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    total_marks INTEGER NOT NULL,
    percentage NUMERIC(5,2),
    passed BOOLEAN,
    status TEXT NOT NULL,
    correct_count INTEGER,
    incorrect_count INTEGER,
    answers JSONB,
    ai_summary JSONB,
    time_taken_minutes INTEGER,
    start_time TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: resources
CREATE TABLE public.resources (
    id TEXT PRIMARY KEY,
    college_id TEXT REFERENCES public.colleges(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT,
    tags TEXT[],
    targets JSONB,
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: doubts
CREATE TABLE public.doubts (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    college_id TEXT REFERENCES public.colleges(id) ON DELETE CASCADE,
    resource_id TEXT REFERENCES public.resources(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    topic TEXT,
    question TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: doubt_replies
CREATE TABLE public.doubt_replies (
    id TEXT PRIMARY KEY,
    doubt_id TEXT REFERENCES public.doubts(id) ON DELETE CASCADE NOT NULL,
    author_id TEXT REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: trainer_notes
CREATE TABLE public.trainer_notes (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
    author_name TEXT,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_college ON public.users(college_id);
CREATE INDEX idx_students_college ON public.students(college_id);
CREATE INDEX idx_batches_college ON public.batches(college_id);
CREATE INDEX idx_exams_college ON public.exams(college_id);
CREATE INDEX idx_exam_results_exam ON public.exam_results(exam_id);
CREATE INDEX idx_exam_results_student ON public.exam_results(student_id);
CREATE INDEX idx_resources_college ON public.resources(college_id);
CREATE INDEX idx_trainer_notes_student ON public.trainer_notes(student_id);

-- RLS (Row Level Security)
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doubts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doubt_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_notes ENABLE ROW LEVEL SECURITY;
