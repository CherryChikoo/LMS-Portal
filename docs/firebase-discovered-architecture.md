# Firebase Discovered Architecture

This document represents the actual Firebase data structure, relationships, and queries discovered by scanning the `src/lib/services/`, `src/types/`, and server routes of this LMS codebase.

## Overview
The existing Firebase database consists of **9 primary collections** mapped by the application. There are no subcollections used; instead, objects (like `questions`) are embedded as arrays, and relational linking is done via string fields (e.g. `collegeId`, `studentId`, `batchIds`).

---

## Collections

### 1. `users`
Represents the overarching user identity. Also shadows the Firebase Authentication layer.
- **Fields:**
  - `id`: string (uid)
  - `email`: string
  - `displayName`: string
  - `role`: string (`main_admin`, `college_admin`, `student`, `admin`, `trainer`)
  - `status`: string (`active`, `inactive`, `restricted`, `deleted`)
  - `collegeId`: string (optional)
  - `collegeName`: string (optional)
  - `department`: string (optional)
  - `academicYear`: string (optional)
  - `section`: string (optional)
  - `batchIds`: string[] (optional)
  - `createdAt`, `updatedAt`: timestamp
- **Main Queries:** `where("collegeId", "==", collegeId)`, `where("collegeName", "==", oldName)`
- **Main Writes:** Created during user/student registration; updated on profile changes.

### 2. `colleges`
Represents a college or organization.
- **Fields:**
  - `id`: string
  - `name`: string
  - `type`: string (`official`, `external`)
  - `code`: string
  - `departments`: string[]
  - `location`: string (optional)
  - `studentCount`: number
  - `adminEmail`: string (optional)
  - `status`: string
  - `branding`: object `{ companyName, companySubtitle, logoBase64 }`
  - `createdAt`, `updatedAt`, `deletedAt`: timestamp
  - `isDeleted`: boolean
- **Main Queries:** `getDocument` by ID, list all colleges.
- **Main Writes:** Used during admin dashboard setup.

### 3. `students`
A specialized profile table for `student` roles, extending the basic user.
- **Fields:**
  - `id`: string (matches Firebase uid)
  - `name`: string
  - `email`: string
  - `phone`: string
  - `collegeId`: string
  - `collegeName`: string (denormalized for display)
  - `department`: string
  - `academicYear`: string
  - `semester`: number
  - `section`: string
  - `rollNumber`: string
  - `enrollmentNo`: string
  - `batchIds`: string[]
  - `mustChangePassword`: boolean
  - `status`: string
  - `createdAt`, `updatedAt`: timestamp
- **Main Queries:** 
  - `where("collegeId", "==", collegeId)`
  - `where("email", "==", email)`
  - `where("batchIds", "array-contains", batchId)`
- **Main Writes:** Bulk import, student registration API.

### 4. `batches`
Logical grouping of students for assignment targeting.
- **Fields:**
  - `id`: string
  - `name`: string
  - `description`: string
  - `collegeId`: string
  - `department`: string
  - `academicYear`: string
  - `section`: string
  - `studentIds`: string[] (Array relationship)
  - `status`: string (`active`, `archived`)
  - `createdAt`, `updatedAt`: timestamp
- **Main Queries:** `where("collegeId", "==", collegeId)`

### 5. `exams`
The core assessment entity.
- **Fields:**
  - `id`: string
  - `title`: string
  - `description`: string
  - `collegeId`: string
  - `collegeName`: string (denormalized)
  - `batchId`: string
  - `durationMinutes`: number
  - `totalMarks`: number
  - `passingMarks`: number
  - `status`: string (`draft`, `scheduled`, `active`, `completed`, `expired`, `cancelled`)
  - `questions`: Array of `Question` objects (EMBEDDED)
    - `id`, `text`, `type`, `options`, `correctAnswer`, `marks`, `explanation`, `subject`, `topic`, `difficulty`
  - `targets`: Array of `AssignmentTarget` objects
  - `scheduledAt`, `startTime`, `endTime`: timestamp
  - `settings`: object `{ shuffleQuestions, shuffleOptions, showResults, allowReview, autoSubmit, proctoring }`
  - `createdBy`: string
  - `createdAt`, `updatedAt`, `deletedAt`: timestamp
- **Main Queries:** 
  - `where("collegeId", "==", collegeId)`
  - Filtered in-memory using `isAssignedToStudent()` checking targets.

### 6. `exam_results` (aka `ExamAttempt`)
The submission and graded result for a student taking an exam.
- **Fields:**
  - `id`: string
  - `examId`: string
  - `examTitle`: string (denormalized)
  - `studentId`: string
  - `studentName`, `studentEmail`, `collegeId`, `collegeName`: string (denormalized)
  - `score`: number
  - `totalMarks`: number
  - `percentage`: number
  - `passed`: boolean
  - `status`: string (`in_progress`, `submitted`, `graded`)
  - `correctCount`, `incorrectCount`: number
  - `answers`: object (map of questionId to selected Option)
  - `aiSummary`: string or object
  - `startTime`, `submittedAt`, `createdAt`, `updatedAt`: timestamp
  - `timeTakenMinutes`: number
- **Main Queries:** 
  - `where("examId", "==", examId)`
  - `where("studentId", "==", studentId)`
  - `where("collegeId", "==", collegeId)`

### 7. `resources`
Educational materials and files.
- **Fields:**
  - `id`: string
  - `title`: string
  - `type`: string (`pdf`, `ppt`, `video`, etc)
  - `url`: string (Firebase Storage URL)
  - `category`: string
  - `tags`: string[]
  - `sharedWith`: string[]
  - `targets`: `AssignmentTarget[]`
  - `collegeId`, `collegeName`, `createdBy`: string
  - `createdAt`, `updatedAt`: timestamp
- **Main Queries:** `where("collegeId", "==", collegeId)`

### 8. `doubts`
Student discussion threads.
- **Fields:**
  - `id`: string
  - `studentId`, `studentName`: string
  - `subject`, `topic`: string
  - `resourceId`, `resourceTitle`: string (optional)
  - `question`: string
  - `reply`, `repliedBy`: string (optional)
  - `replies`: Array of Objects `{id, authorId, authorName, role, text, createdAt}`
  - `status`: string (`open`, `resolved`)
  - `collegeId`: string
  - `createdAt`, `updatedAt`: timestamp
- **Main Queries:** Fetch by student or college.

### 9. `trainer_notes`
Private notes left by trainers against students.
- **Fields:**
  - `id`: string
  - `studentId`: string
  - `text`: string
  - `authorName`: string
  - `createdAt`: timestamp
- **Main Queries:** `where("studentId", "==", studentId)`

---

## Authentication Layer
- Uses Firebase Authentication (Email/Password).
- `createUserWithEmailAndPassword` is extensively used in the Admin bulk importer.
- The system heavily maps Firebase Auth `uid` directly into the `users.id` and `students.id`.

## Storage Layer
- Firebase Storage is used for Resource files (PDFs, PPTs, Images).
- The `url` field in `resources` points directly to these uploaded files.

## Identified Denormalization & Duplication
- `collegeName` is aggressively cached across `students`, `exams`, `exam_results`, and `resources`. This was likely done to avoid joining the `colleges` collection on every read.
- `batchIds` and `studentIds` are duplicated to manage assignments.
- `studentName` and `examTitle` are heavily cached in `exam_results`.
