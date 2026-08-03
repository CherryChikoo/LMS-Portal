# 🏗️ Executive System Overview & Tech Stack

## System Summary
The LMS Portal is a multi-tenant Learning Management System designed to handle hierarchical access between three distinct role categories: **Main Admin** (Global System Admins), **College Admin** (Institution Managers), and **Student** (Learners). The application provides robust workflows for academic batches, dynamic exam assignment, real-time leaderboards, AI-assisted answering, and resource provisioning, fully bounded by Firebase Security Rules matching standard RBAC architecture.

## Tech Stack
* **Frontend/Framework**: Next.js 16.2 (App Router with Turbopack), React 19.
* **Styling & UI**: Tailwind CSS v4, ShadCN UI, Base UI, Lucide React, Motion (Framer Motion).
* **Backend Platform**: Firebase Client SDK (v12.x), Firebase Admin SDK.
* **Database**: Firestore (NoSQL, heavily denormalized).
* **Storage**: Firebase Storage (for profile images and exam resources).
* **Language & Types**: TypeScript (v5), Zod (Runtime Schema Validation).
* **AI/LLM**: Google Generative AI (Gemini 1.5).

## Multi-Tenant Architecture
The system uses `collegeId` as the primary multi-tenant security boundary.
1. **Main Admin**: Superuser with read/write access across all tenants. Allowed to create, delete, and view all colleges and students globally.
2. **College Admin**: Tenant-scoped administrative user. Can only read, write, and manage entities (students, exams, batches, resources) where the document's `collegeId` strictly matches their own authenticated Firebase Custom Claim or user document `collegeId`.
3. **Student**: Learner-scoped user. Can only view records matching their assigned `collegeId`. Furthermore, students are explicitly blocked from reading draft exams, creating profiles with arbitrary roles, and modifying their own `collegeId`.

---

# 📁 Exhaustive Directory & File Structure Map

## `src/app/` (Next.js App Router)
Handles all React Server Components, Client Layouts, Pages, and API endpoints.
* **`(auth)/`**: Contains public-facing login routes, credential recovery, and authentication flows.
* **`(dashboard)/`**: The primary administrative dashboard (Main Admin / College Admin). Houses pages like `/colleges`, `/students`, `/exams`, and `/resources`.
* **`student/`**: The localized student workspace. Contains the learner dashboard, available exams, attempt pages, leaderboards, and peer directories.
* **`api/`**: 
  * `admin/*`: Privileged endpoints utilizing `firebase-admin` for securely creating accounts, normalizing colleges, bulk importing via CSV, and overriding Auth definitions.
  * `ai-explanation/`, `ai-review/`, `ai-summary/`: Wrappers connecting to Google Generative AI for grading and summarizing student submissions.
  * `auth/`, `delete-user/`: Secure credential management wrappers.
* **`layout.tsx`**: The main Server Component wrapper injecting NextThemes, the `Toaster` component, and top-level global contexts.

## `src/lib/` (Core Logic & Integrations)
* **`firebase/`**:
  * `config.ts`: Client SDK initialization.
  * `admin.ts`: Firebase Admin SDK initialization (secure, Server-only).
  * `firestore.ts`: Abstracted query layer standardizing all Firestore CRUD interactions, standardizing pagination, and injecting strict generic types.
* **`services/`**: The bridge between Firestore and the UI.
  * `auth-service.ts`: Handles signIn, signOut, password syncs, and Unified Login flows.
  * `student-service.ts`, `exam-service.ts`, `college-service.ts`, `batch-service.ts`: Domain-specific API collections interacting with their respective Firestore collections (`subscribeToExamsByCollege`, `getBatchesByCollege`, etc.).
* **`data/`**:
  * `lms-data-cache.ts`: The pivotal real-time data layer. Subscribes to Firebase collections based on the active user role (`subscribeTo...ByCollege` vs `subscribeToAll...`), applying front-end filtering algorithms, and caching the payload in `localStorage` to eliminate redundant reads and reduce Firebase billing costs.
  * `lms-store.ts`: A lightweight global state manager exposing the latest cache to React components without triggering cascading context re-renders.

## `src/types/` (TypeScript Domain Definitions)
* **`index.ts`**: Centralized repository of all database entity interfaces (`User`, `Student`, `Exam`, `College`, `Batch`, `ExamAttempt`). Contains all strict Zod validation schemas to sanitize API inputs and enforce data integrity.

## `src/components/` (Presentation & UI)
* **`ui/`**: Specialized raw ShadCN components (Buttons, Inputs, Cards, Dialogs, Selects, Toasts, Dropdowns). Highly modular and Reusable.
* **`nav/`**:
  * `Sidebar.tsx`: Administrative sidebar routing UI.
  * `StudentSidebar.tsx`: Learner sidebar UI.
  * `Header.tsx`: Global navigation header housing user profile popovers.

## Root Configuration Files
* **`firestore.rules`**: The bedrock of the LMS security model. Implements rigorous RBAC checking using `exists()` helpers, locking read/writes tightly down to `isOwner`, `isMainAdmin`, or `belongsToSameCollege`.
* **`firestore.indexes.json`**: Deploys critical composite indexes allowing Firestore to execute cross-field sorted queries efficiently (e.g., matching `collegeId`, ignoring `status == draft`, ordered by `createdAt`).
* **`next.config.js`**: Standard App Router configuration for the Turbopack build engine.
* **`package.json`**: Dependencies definition and exact NPM script hooks.

---

# 🔄 Data Flow & State Management Architecture

1. **Authentication & Initialization**: A user authenticates via Firebase Auth. The `onAuthStateChanged` listener in `lms-data-cache.ts` intercepts the login and resolves the user's role (either from Custom Claims or via a secure fallback lookup to the `/users/` or `/students/` Firestore collections).
2. **Data Subscription Partitioning**:
   * If `role == main_admin`, `lms-data-cache.ts` calls `subscribeToAll...()` methods, fetching global system data.
   * If `role == college_admin`, it calls `subscribeTo...ByCollege(user.collegeId)`, retrieving only the specific institution's slice.
   * If `role == student`, it fetches `subscribeTo...ByCollege(user.collegeId)`, specifically utilizing `subscribeToPublishedExamsByCollege()` to ensure draft exams are dropped at the query layer.
3. **Optimistic Local Caching**: Data is pulled through `onSnapshot` listeners, sanitized, and stored centrally in `lms-data-cache.ts`. It's simultaneously flushed to `localStorage` (with a debounce) to allow instant visual rendering upon page reloads.
4. **React Projection**: Components utilize a custom hook (`useLMSData`) to read from the singleton `lms-store.ts`, avoiding deep React Context tree propagations and mitigating the dreaded "use client" root Layout performance bottlenecks.

---

# 🚨 Comprehensive Known Issues, Vulnerabilities & Bugs Matrix

### 1. Permission & Security Rule Mismatches
* ✅ **RESOLVED**: A critical mismatch previously existed where frontend data fetchers did not apply `.where("collegeId", "==", id)` constraints, triggering Firebase "Insufficient Permissions" against the hardened `firestore.rules`.
* ✅ **RESOLVED**: `trainer@gmail.com` fallback login by email was failing due to security rules preventing `read` by email. This has been explicitly patched.
* ⚠️ **LINGERING RISK**: If a user is created natively inside the Firebase Auth console (or via bulk CSV) and their Firestore `/users/{uid}` document is created with an auto-generated ID rather than precisely matching their `authUser.uid`, auth fallback routines will still fragment. 

### 2. Authorization & BOLA (Broken Object Level Authorization) Risks
* ⚠️ **API Route Validation**: Next.js Server API endpoints in `/api/admin/*` explicitly require the user to hold `admin` privileges. However, some endpoints parse request bodies (e.g., CSV Imports) where malicious injection of `{ "role": "superadmin" }` must be meticulously guarded by server-side Zod validation before patching Firebase Admin records.
* ⚠️ **AI Endpoints Abuse**: `/api/ai-summary` and `/api/ai-review` endpoints utilize the user's token, but do not strictly validate whether the user *actually* owns the `attemptId` they are requesting an AI review for. A malicious student could theoretially swap an `attemptId` and drain Gemini API quotas analyzing other students' tests.

### 3. Performance & Database Costs
* ⚠️ **Unbounded API Queries**: While the client heavily relies on partitioned `onSnapshot` listeners, if a college scales to 10,000+ students, loading the entire `/students` collection into the local `lms-data-cache.ts` will crash the browser memory and trigger massive Firebase read spikes. 
* ⚠️ **Missing Pagination**: The application does not widely implement `.limit()` or cursor-based pagination (`startAfter()`) on heavy collections like `exam_results`.

### 4. Type Safety & Code Quality
* ✅ **RESOLVED**: Implicit `any` usages have been broadly eliminated.
* ⚠️ **React Error Boundaries**: There is a lack of localized `error.tsx` boundary files inside the `/student` and `/(dashboard)` route groups. If `lms-data-cache.ts` crashes or encounters a corrupted `localStorage` payload, the entire app UI whitescreens.

---

# 🛠️ Step-by-Step Remediation Plan & Roadmap

## Priority 1: Secure Server Action & API Endpoints (BOLA Mitigation)
* **Action**: Enforce `isOwner(studentId)` or `isCollegeAdmin` logic strictly within the `/api/ai-review` and `/api/ai-explanation` Next.js routes. 
* **Implementation**: Before calling the Gemini API, execute an Admin SDK read against the `exam_results/{attemptId}` to verify that `attempt.studentId === request.auth.uid`.

## Priority 2: Implement Cursor-Based Pagination for Analytics
* **Action**: Refactor `lms-data-cache.ts` to stop indiscriminately downloading the entire `exam_results` and `students` collections.
* **Implementation**: Transition the dashboard tables away from client-side array filtering (`data.filter()`) to server-side querying using `.limit(50)` and `.startAfter(lastVisible)`.

## Priority 3: Stabilize User Creation Document Keys
* **Action**: Refactor all registration flows (especially CSV bulk imports and `admin/create-student-auth/route.ts`).
* **Implementation**: Completely ban `addDoc(collection(db, 'users'), payload)`. Replace every user/student creation vector with `setDoc(doc(db, 'users', authUser.uid), payload)`.

## Priority 4: Implement React Error Boundaries
* **Action**: Add `error.tsx` files to `/src/app/student/` and `/src/app/(dashboard)/`.
* **Implementation**: Create fallback UI states using ShadCN components that allow the user to cleanly execute `localStorage.clear()` and automatically reload the route.
