import { createUserWithEmailAndPassword, updateProfile, getAuth } from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import { auth, db, firebaseConfig } from "@/lib/firebase/config";
import { doc, setDoc, getDocs, collection, query, where, writeBatch } from "firebase/firestore";
import type { CSVStudentRow, CSVImportSummary, StudentImportCredential, Student, User } from "@/types";

/**
 * Parse CSV string into structured student rows
 */
export function parseStudentsCSV(csvText: string): CSVStudentRow[] {
  const lines = csvText
    .split(/\r\n|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Parse header
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/['"_-]/g, " ").trim());

  // Helper to find index matching specific positive keywords without matching negative exclusion words
  const findColIdx = (posKeywords: string[], negKeywords: string[] = []): number => {
    // 1. First try exact equality match
    const exactIdx = headers.findIndex((h) => posKeywords.includes(h));
    if (exactIdx !== -1) return exactIdx;

    // 2. Try substring match avoiding negative keywords
    return headers.findIndex((h) => {
      const matchesPos = posKeywords.some((pk) => h.includes(pk));
      const matchesNeg = negKeywords.some((nk) => h.includes(nk));
      return matchesPos && !matchesNeg;
    });
  };

  // 1. Email Index (check header or fallback to scanning row 1 for email regex)
  let emailIdx = findColIdx(["email", "mail", "e-mail", "collegeemail"]);
  if (emailIdx === -1 && lines.length > 1) {
    const firstRowCols = parseLine(lines[1]);
    emailIdx = firstRowCols.findIndex((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim()));
  }

  // 2. Student Name Index (must not be class name, college name, dept name, institution name)
  let nameIdx = findColIdx(
    ["student name", "full name", "studentname", "fullname", "name", "student", "candidate", "learner"],
    ["class", "college", "dept", "depart", "institution", "school", "username", "file", "batch", "email"]
  );

  // 3. College / Institution Index
  const collegeIdx = findColIdx(
    ["college", "collegename", "institution", "institute", "university", "campus", "school", "org"],
    ["email"]
  );

  // 4. Department / Branch Index
  const deptIdx = findColIdx(
    ["department", "dept", "branch", "stream", "major", "course", "specialization"],
    ["name"]
  );

  // 5. Academic Year Index
  const yearIdx = findColIdx(
    ["academic year", "academicyear", "year", "yr", "study year", "current year"],
    ["birth", "grad", "passout"]
  );

  // 6. Section / Class Index
  const secIdx = findColIdx(
    ["section", "sec", "class", "div", "division", "group"],
    ["name", "secondary"]
  );

  // 7. Batch Index
  const batchIdx = findColIdx(
    ["batch", "passout", "graduation", "grad year", "session", "batch year"],
    []
  );

  const rows: CSVStudentRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0 || !cols.some((c) => c !== "")) continue;

    // Identify email for this row if emailIdx wasn't found
    let rowEmail = emailIdx >= 0 ? cols[emailIdx] || "" : "";
    if (!rowEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rowEmail)) {
      const foundEmailCol = cols.find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim()));
      if (foundEmailCol) rowEmail = foundEmailCol;
    }

    // Identify student name for this row if nameIdx wasn't found
    let rowName = nameIdx >= 0 ? cols[nameIdx] || "" : "";
    if (!rowName) {
      // Find first non-empty column that isn't the email
      rowName = cols.find((c, idx) => idx !== emailIdx && c.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim())) || "Unknown Student";
    }

    const isDocId = /^(stu|att|exam|col|res|batch|user|usr)-[a-zA-Z0-9]+$/i.test(rowName.trim()) || /^(stu|att|exam|col|res|batch|user|usr)-[a-zA-Z0-9]+$/i.test(rowEmail.trim());
    
    // Only import valid student rows with email addresses
    if (!rowEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rowEmail) || isDocId) {
      continue;
    }

    const rawCollegeVal = collegeIdx >= 0 && cols[collegeIdx] ? cols[collegeIdx].trim() : "";
    const normColLower = rawCollegeVal.toLowerCase();
    const isReservedCol = !rawCollegeVal || 
      ["all", "all colleges", "all institutions", "select college", "global", "default college", "unassigned", "none", "n/a", "null"].includes(normColLower);

    rows.push({
      studentName: rowName.trim(),
      collegeEmail: rowEmail.trim(),
      college: isReservedCol ? "UNASSIGNED" : rawCollegeVal,
      department: deptIdx >= 0 && cols[deptIdx] ? cols[deptIdx].trim() : "General",
      academicYear: yearIdx >= 0 && cols[yearIdx] ? cols[yearIdx].trim() : "Year 1",
      section: secIdx >= 0 && cols[secIdx] ? cols[secIdx].trim() : "A",
      batch: batchIdx >= 0 && cols[batchIdx] ? cols[batchIdx].trim() : "2026",
    });
  }

  return rows;
}

/**
 * Return a standard default temporary password
 */
function generateTempPassword(): string {
  return "Welcome@123";
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Batch process and import student accounts into Firebase Auth + Firestore
 */
export async function importStudentsCSV(
  rows: CSVStudentRow[],
  onProgress?: (processed: number, total: number) => void,
  shouldCancel?: () => boolean,
  enrollmentType: "csv" | "manual" = "csv"
): Promise<CSVImportSummary> {
  // High-speed Server-side Admin Bulk Import Attempt
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const adminIdToken = await currentUser.getIdToken();
      const CHUNK_SIZE = 100;
      const combinedSummary: CSVImportSummary = {
        total: rows.length,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        duplicateCount: 0,
        results: [],
      };

      if (onProgress) onProgress(0, rows.length);

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        if (shouldCancel && shouldCancel()) {
          combinedSummary.skippedCount += rows.length - i;
          break;
        }

        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const response = await fetch("/api/admin/bulk-import-students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminIdToken, rows: chunk, enrollmentType }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.summary) {
            combinedSummary.createdCount += data.summary.createdCount || 0;
            combinedSummary.skippedCount += data.summary.skippedCount || 0;
            combinedSummary.failedCount += data.summary.failedCount || 0;
            combinedSummary.duplicateCount += data.summary.duplicateCount || 0;
            if (Array.isArray(data.summary.results)) {
              combinedSummary.results.push(...data.summary.results);
            }
          }
        }

        const currentProcessed = Math.min(i + CHUNK_SIZE, rows.length);
        if (onProgress) onProgress(currentProcessed, rows.length);
      }

      if (onProgress) onProgress(rows.length, rows.length);
      return combinedSummary;
    } catch (apiErr) {
      console.warn("Server bulk import failed, falling back to resilient client import:", apiErr);
    }
  }

  const summary: CSVImportSummary = {
    total: rows.length,
    createdCount: 0,
    skippedCount: 0,
    failedCount: 0,
    duplicateCount: 0,
    results: [],
  };

  // Pre-fetch existing emails from Firestore to minimize queries
  const existingEmails = new Set<string>();
  try {
    const q = query(collection(db, "students"));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data() as { email?: string };
      if (data.email) existingEmails.add(data.email.toLowerCase());
    });
  } catch {
    // If collection empty or error, proceed
  }

  const seenEmailsInCSV = new Set<string>();
  const validRows: { row: CSVStudentRow; email: string; name: string }[] = [];

  for (const row of rows) {
    const email = row.collegeEmail.trim().toLowerCase();
    const name = row.studentName.trim();

    // Check required fields
    if (!email || !name) {
      summary.skippedCount++;
      summary.results.push({
        name: name || "Unknown",
        email: email || "Missing Email",
        password: "",
        status: "skipped",
        reason: "Missing Name or Email",
      });
      continue;
    }

    // Check valid email
    if (!isValidEmail(email)) {
      summary.failedCount++;
      summary.results.push({
        name,
        email,
        password: "",
        status: "failed",
        reason: "Invalid Email Format",
      });
      continue;
    }

    // Check duplicates inside CSV or already in Firestore
    if (seenEmailsInCSV.has(email) || existingEmails.has(email)) {
      summary.duplicateCount++;
      summary.results.push({
        name,
        email,
        password: "",
        status: "duplicate",
        reason: existingEmails.has(email) ? "Account already exists in database" : "Duplicate email in CSV file",
      });
      continue;
    }

    seenEmailsInCSV.add(email);
    validRows.push({ row, email, name });
  }

  if (onProgress) onProgress(0, validRows.length);

  // Helper for instant cancellation check during delays
  const cancellableSleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const step = 50;
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += step;
        if (elapsed >= ms || (shouldCancel && shouldCancel())) {
          clearInterval(timer);
          resolve();
        }
      }, step);
    });

  // Initialize a temporary secondary Firebase App so admin auth session is never logged out or disrupted
  let creatorAuth = auth;
  let tempApp: ReturnType<typeof initializeApp> | null = null;
  try {
    const appName = `CSV_CREATOR_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    tempApp = initializeApp(firebaseConfig, appName);
    creatorAuth = getAuth(tempApp);
  } catch {
    // Fallback to primary auth if secondary initialization fails
  }

  try {
    // Helper with exponential backoff retry for Firebase rate limits (auth/too-many-requests)
    const createAuthUserWithRetry = async (emailStr: string, passStr: string, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (shouldCancel && shouldCancel()) {
          throw new Error("Cancelled by user");
        }
        try {
          return await createUserWithEmailAndPassword(creatorAuth, emailStr, passStr);
        } catch (err: any) {
          if (shouldCancel && shouldCancel()) {
            throw new Error("Cancelled by user");
          }
          const msg = err?.message || "";
          const code = err?.code || "";
          if ((code === "auth/too-many-requests" || msg.includes("too-many-requests")) && attempt < maxRetries) {
            await cancellableSleep(attempt * 2000);
            continue;
          }
          throw err;
        }
      }
      throw new Error("Auth rate limit exceeded");
    };

    // Process rows in controlled chunks (concurrency limit = 3) with slight stagger to avoid Firebase Auth rate limits
    const CHUNK_SIZE = 3;
    let processedCount = 0;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      if (shouldCancel && shouldCancel()) {
        summary.skippedCount += validRows.length - processedCount;
        break;
      }

      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async ({ row, email, name }, idx) => {
          if (shouldCancel && shouldCancel()) {
            processedCount++;
            if (onProgress) onProgress(processedCount, validRows.length);
            return;
          }

          if (idx > 0) {
            await cancellableSleep(idx * 250);
          }
          if (shouldCancel && shouldCancel()) {
            processedCount++;
            if (onProgress) onProgress(processedCount, validRows.length);
            return;
          }

          const tempPassword = generateTempPassword();
          try {
            const cred = await createAuthUserWithRetry(email, tempPassword);
            const uid = cred.user.uid;

            const studentDoc: Student = {
              id: uid,
              name,
              email,
              collegeId: row.college.toLowerCase().replace(/\s+/g, "-"),
              collegeName: row.college.toLowerCase(),
              department: row.department,
              academicYear: row.academicYear,
              semester: 1,
              section: row.section,
              rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
              batchIds: [row.batch],
              mustChangePassword: true,
              enrollmentType: enrollmentType,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const userDoc: User = {
              id: uid,
              email,
              displayName: name,
              role: "student",
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Execute auth updateProfile and atomic Firestore document writes
            if (cred.user) {
              await updateProfile(cred.user, { displayName: name });
            }
            const batch = writeBatch(db);
            batch.set(doc(db, "students", uid), studentDoc);
            batch.set(doc(db, "users", uid), { ...userDoc, mustChangePassword: true });
            await batch.commit();

            summary.createdCount++;
            summary.results.push({
              name,
              email,
              password: tempPassword,
              status: "created",
            });
            existingEmails.add(email);
          } catch (err: unknown) {
            if (err instanceof Error && err.message === "Cancelled by user") {
              summary.skippedCount++;
              summary.results.push({
                name,
                email,
                password: "",
                status: "skipped",
                reason: "Cancelled by user",
              });
            } else {
              const msg = err instanceof Error ? err.message : "Auth creation failed";
              const code = (err as any)?.code || "";

              // If Firebase client Auth throttles IP (auth/too-many-requests), use resilient Just-In-Time (JIT) provisioning
              if (code === "auth/too-many-requests" || msg.includes("too-many-requests")) {
                const uid = `JIT-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
                const studentDoc: Student & { initialPassword?: string } = {
                  id: uid,
                  name,
                  email,
                  collegeId: row.college.toLowerCase().replace(/\s+/g, "-"),
                  collegeName: row.college.toLowerCase(),
                  department: row.department,
                  academicYear: row.academicYear,
                  semester: 1,
                  section: row.section,
                  rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
                  batchIds: [row.batch],
                  mustChangePassword: true,
                  initialPassword: tempPassword,
                  enrollmentType: enrollmentType,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };

                const userDoc: User = {
                  id: uid,
                  email,
                  displayName: name,
                  role: "student",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };

                try {
                  const batch = writeBatch(db);
                  batch.set(doc(db, "students", uid), studentDoc);
                  batch.set(doc(db, "users", uid), { ...userDoc, mustChangePassword: true });
                  await batch.commit();
                  summary.createdCount++;
                  summary.results.push({
                    name,
                    email,
                    password: tempPassword,
                    status: "created",
                  });
                  existingEmails.add(email);
                } catch {
                  summary.failedCount++;
                  summary.results.push({
                    name,
                    email,
                    password: "",
                    status: "failed",
                    reason: "Database error during resilient provisioning",
                  });
                }
              } else {
                summary.failedCount++;
                summary.results.push({
                  name,
                  email,
                  password: "",
                  status: "failed",
                  reason: msg.includes("email-already-in-use") || code === "auth/email-already-in-use" ? "Email already registered in Auth" : msg,
                });
              }
            }
          } finally {
            processedCount++;
            if (onProgress) onProgress(processedCount, validRows.length);
          }
        })
      );
    }
  } finally {
    if (tempApp) {
      try {
        await deleteApp(tempApp);
      } catch {
        // ignore cleanup error
      }
    }
  }

  return summary;
}

/**
 * Generate CSV string containing credentials for download
 */
export function generateCredentialsCSV(results: StudentImportCredential[]): string {
  const header = "Student Name,College Email,Temporary Password,Status,Reason\r\n";
  const rows = results
    .map((r) => `"${r.name}","${r.email}","${r.password}","${r.status}","${r.reason || ""}"`)
    .join("\r\n");
  return header + rows;
}
