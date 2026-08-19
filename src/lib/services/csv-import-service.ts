import { getErrorMessage } from '@/lib/utils/error';
import { supabase } from "@/lib/supabase/client";
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
  const nameIdx = findColIdx(
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
  // Use crypto to generate a strong random password since we no longer hardcode defaults
  return crypto.randomUUID().slice(0, 16) + 'Aa1!';
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
  const { data: authData } = await supabase.auth.getUser();
  const currentUser = authData?.user;
  if (currentUser) {
    try {
      const CHUNK_SIZE = 50; // 50 rows per batch
      const combinedSummary: CSVImportSummary = {
        total: rows.length,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        duplicateCount: 0,
        results: [],
      };

      if (onProgress) onProgress(0, rows.length);

      const chunks: CSVStudentRow[][] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
      }

      let processedCount = 0;
      const MAX_CONCURRENT_REQUESTS = 2;

      const sendChunkWithRetry = async (chunk: CSVStudentRow[], retries = 3): Promise<any> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          if (shouldCancel && shouldCancel()) return null;
          try {
            const sessionData = await supabase.auth.getSession();
            let adminIdToken = sessionData.data.session?.access_token || "";
            if (!adminIdToken) {
              const refresh = await supabase.auth.refreshSession();
              adminIdToken = refresh.data.session?.access_token || "";
            }

            const response = await fetch("/api/admin/bulk-import-students", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(adminIdToken ? { Authorization: `Bearer ${adminIdToken}` } : {})
              },
              body: JSON.stringify({ adminIdToken, rows: chunk, enrollmentType }),
            });

            let data;
            try {
              data = await response.json();
            } catch (jsonErr) {
              console.error("Failed to parse server response:", jsonErr);
              data = { error: "Invalid server response", success: false };
            }

            if (response.ok && data.success && data.summary) {
              return data.summary;
            }
            const errReason = data.error || data.details || `HTTP ${response.status} ${response.statusText}`;
            if (attempt === retries) {
              console.error("Chunk import server error after retries:", errReason);
              return { errorReason: errReason, failedRows: chunk };
            }
          } catch (fetchErr: unknown) {
            if (attempt === retries) {
              return { errorReason: getErrorMessage(fetchErr) || "Network error", failedRows: chunk };
            }
          }
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, attempt * 600));
          }
        }
        return null;
      };

      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_REQUESTS) {
        if (shouldCancel && shouldCancel()) break;
        const batchChunks = chunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
        const chunkPromises = batchChunks.map((chunk) => sendChunkWithRetry(chunk));
        const summaries = await Promise.all(chunkPromises);

        for (let sIdx = 0; sIdx < summaries.length; sIdx++) {
          const resSummary = summaries[sIdx];
          const currentChunk = batchChunks[sIdx];
          const chunkSize = currentChunk.length;

          if (resSummary && !resSummary.errorReason) {
            processedCount += chunkSize;
            combinedSummary.createdCount += resSummary.createdCount || 0;
            combinedSummary.skippedCount += resSummary.skippedCount || 0;
            combinedSummary.failedCount += resSummary.failedCount || 0;
            combinedSummary.duplicateCount += resSummary.duplicateCount || 0;
            if (Array.isArray(resSummary.results)) {
              combinedSummary.results.push(...resSummary.results);
            }
          } else {
            // Gracefully record failure for this chunk and keep importing the rest
            processedCount += chunkSize;
            combinedSummary.failedCount += chunkSize;
            const reason = resSummary?.errorReason || "Server batch timeout";
            currentChunk.forEach((r) => {
              combinedSummary.results.push({
                name: r.studentName || "Unknown",
                email: r.collegeEmail || "Unknown",
                password: "",
                status: "failed",
                reason,
              });
            });
          }
        }

        if (onProgress) onProgress(processedCount, rows.length);
        // Small throttle between batches to avoid connection limits
        await new Promise((r) => setTimeout(r, 120));
      }

      if (onProgress) onProgress(rows.length, rows.length);
      return combinedSummary;
    } catch (apiErr) {
      console.error("Server bulk import endpoint failed or returned error:", apiErr);
      throw apiErr;
    }
  } else {
    throw new Error("Must be logged in to import students");
  }
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
