import { db, auth } from "@/lib/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { getDocuments, type QueryOptions, type PaginatedResult } from "@/lib/firebase/firestore";
import type { College, SelectOption, User } from "@/types";

/**
 * ChunkedBatch class for handling large batch operations in Firestore
 * automatically committing when the 500 operation limit is approached.
 */
class ChunkedBatch {
  private db: any;
  private batch: any;
  private count = 0;
  private commitPromises: Promise<any>[] = [];
  constructor(db: any) {
    this.db = db;
    this.batch = writeBatch(db);
  }
  update(ref: any, data: any) {
    this.batch.update(ref, data);
    this.count++;
    if (this.count >= 400) {
      this.commitPromises.push(this.batch.commit());
      this.batch = writeBatch(this.db);
      this.count = 0;
    }
  }
  async commit() {
    if (this.count > 0) {
      this.commitPromises.push(this.batch.commit());
      this.count = 0;
    }
    await Promise.all(this.commitPromises);
    this.commitPromises = [];
  }
}

/**
 * Predefined department options for colleges
 */
export const PREDEFINED_DEPARTMENTS = [
  "Computer Science & Engineering (CSE)",
  "Electronics & Communication Engineering (ECE)",
  "Electrical & Electronics Engineering (EEE)",
  "Mechanical Engineering (ME)",
  "Civil Engineering (CE)",
  "Information Technology (IT)",
  "Artificial Intelligence & Data Science (AI&DS)",
  "Computer Science & Business Systems (CSBS)",
  "Biotechnology (BT)",
  "Chemical Engineering (CHE)",
  "Aerospace Engineering (AE)",
  "Automobile Engineering (AUTO)",
  "General",
  "Custom Department",
];

/**
 * Ensure General department is always included
 */
export function ensureGeneralDepartment(departments: string[]): string[] {
  const depts = [...departments];
  if (!depts.includes("General")) {
    depts.push("General");
  }
  return depts;
}

/**
 * Fetch all colleges from Firestore
 */
export async function fetchColleges(options?: QueryOptions): Promise<PaginatedResult<College>> {
  return getDocuments<College>("colleges", [orderBy("createdAt", "desc")], false, options);
}

/**
 * Get all colleges (alias for consistency)
 */
export const getAllColleges = fetchColleges;

/**
 * Subscribe to all colleges with real-time updates
 */

/**
 * Fetch a single college by ID
 */
export async function fetchCollegeById(id: string): Promise<College | null> {
  const docRef = doc(db, "colleges", id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as College;
}

/**
 * Get college by ID (alias for consistency with other services)
 */
export const getCollegeById = fetchCollegeById;

/**
 * Create a new college
 */
export async function createCollege(data: Partial<College>): Promise<string> {
  const now = Timestamp.now();
  const name = data.name ? data.name.trim().toLowerCase() : "";

  const collegeData = {
    ...data,
    name,
    studentCount: 0,
    status: "active",
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(db, "colleges"), collegeData);

  return docRef.id;
}

/**
 * Update an existing college
 */
export async function updateCollege(
  id: string,
  data: Partial<College>
): Promise<void> {
  if (!id) return;
  const docRef = doc(db, "colleges", id);

  const updateData = { ...data };
  if (updateData.name) {
    updateData.name = updateData.name.trim().toLowerCase();
  }

  // Auth Execution Lock: Update Firebase Auth via API if adminEmail or name changed
  if (data.adminEmail || data.name) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Cannot update college authentication: Session token expired. Please sign in again.");
    }
    const adminIdToken = await currentUser.getIdToken(true);
    const payload: Record<string, unknown> = {
      collegeId: id,
    };

    if (data.adminEmail) payload.adminEmail = data.adminEmail;
    if (data.name) payload.collegeName = data.name;

    const response = await fetch("/api/admin/update-college-auth", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminIdToken}`
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Update failed: Could not update College Admin Auth account.");
    }
  }

  // Update remaining fields in Firestore directly if there are any other fields, 
  // or if the API already updated name/adminEmail, it's safe to merge again.
  await setDoc(
    docRef,
    {
      id,
      ...updateData,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function deleteCollege(id: string, onProgress?: (msg: string) => void): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("User must be authenticated to delete colleges");
  }

  const adminIdToken = await currentUser.getIdToken(true);

  if (onProgress) {
     onProgress("Deleting college and associated data...");
  }

  const res: Response = await fetch("/api/admin/delete-college", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminIdToken}`
    },
    body: JSON.stringify({ id }),
  });

  const result = await res.json();

  if (!res.ok || !result.success) {
    throw new Error(
      result.error ||
      result.message ||
      `Failed to delete college: ${res.status} ${res.statusText}`
    );
  }
}

/**
 * Fetch student count for a college
 */
export async function fetchCollegeStudentCount(collegeId: string): Promise<number> {
  const q = query(
    collection(db, "students"),
    where("collegeId", "==", collegeId)
  );

  const snapshot = await getDocs(q);
  return snapshot.size;
}

/**
 * Update college student count
 */
export async function updateCollegeStudentCount(
  collegeId: string,
  count: number
): Promise<void> {
  if (!collegeId) return;
  const docRef = doc(db, "colleges", collegeId);

  await setDoc(
    docRef,
    {
      id: collegeId,
      studentCount: count,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Soft delete a college (mark as deleted)
 */
export async function softDeleteCollege(id: string): Promise<void> {
  if (!id) return;
  const docRef = doc(db, "colleges", id);

  await setDoc(
    docRef,
    {
      id,
      isDeleted: true,
      status: "deleted",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Restore a soft-deleted college
 */
export async function restoreCollege(id: string): Promise<void> {
  if (!id) return;
  const docRef = doc(db, "colleges", id);

  await setDoc(
    docRef,
    {
      id,
      isDeleted: false,
      status: "active",
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Rename college and migrate all student references
 */
export async function renameCollegeAndMigrate(
  collegeId: string,
  oldName: string,
  newName: string,
  isExternal: boolean = false
): Promise<void> {
  const batch = new ChunkedBatch(db);
  const cleanSlug = (v?: string) => (v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "");
  const normalizedNewName = newName.trim().toLowerCase();
  const targetOldSlugName = cleanSlug(oldName);
  const targetOldSlugId = cleanSlug(collegeId);

  // Update official college document if not external
  if (!isExternal) {
    const collegeRef = doc(db, "colleges", collegeId);
    batch.update(collegeRef, {
      name: normalizedNewName,
      updatedAt: Timestamp.now(),
    });
  }

  // Fetch students specific to this college (by ID or exact old name)
  const studentQueries = [query(collection(db, "students"), where("collegeId", "==", collegeId))];
  if (oldName) studentQueries.push(query(collection(db, "students"), where("collegeName", "==", oldName)));
  
  const studentSnaps = await Promise.all(studentQueries.map(q => getDocs(q)));
  const processedStudentIds = new Set<string>();

  studentSnaps.forEach(snap => {
    snap.docs.forEach((studentDoc) => {
      if (processedStudentIds.has(studentDoc.id)) return;
      processedStudentIds.add(studentDoc.id);
      
      const sData = studentDoc.data();
      const sColId = sData?.collegeId || "";
      const sColName = sData?.collegeName || "";
      const slugId = cleanSlug(sColId);
      const slugName = cleanSlug(sColName);

      const matches =
        sColId === collegeId ||
        sColName === oldName ||
        sColId === oldName ||
        sColName === collegeId ||
        (targetOldSlugId && slugId === targetOldSlugId) ||
        (targetOldSlugId && slugName === targetOldSlugId) ||
        (targetOldSlugName && slugId === targetOldSlugName) ||
        (targetOldSlugName && slugName === targetOldSlugName);

      if (matches) {
        batch.update(studentDoc.ref, {
          collegeId: isExternal ? normalizedNewName : (sColId || collegeId),
          collegeName: normalizedNewName,
          updatedAt: Timestamp.now(),
        });
      }
    });
  });

  // Fetch users specific to this college
  const userQueries = [query(collection(db, "users"), where("collegeId", "==", collegeId))];
  if (oldName) userQueries.push(query(collection(db, "users"), where("collegeName", "==", oldName)));
  
  const userSnaps = await Promise.all(userQueries.map(q => getDocs(q)));
  const processedUserIds = new Set<string>();

  userSnaps.forEach(snap => {
    snap.docs.forEach((uDoc) => {
      if (processedUserIds.has(uDoc.id)) return;
      processedUserIds.add(uDoc.id);
      
      const uData = uDoc.data();
      const uColId = uData?.collegeId || "";
      const uColName = uData?.collegeName || "";
      const slugId = cleanSlug(uColId);
      const slugName = cleanSlug(uColName);

      const matches =
        uColId === collegeId ||
        uColName === oldName ||
        uColId === oldName ||
        uColName === collegeId ||
        (targetOldSlugId && slugId === targetOldSlugId) ||
        (targetOldSlugId && slugName === targetOldSlugId) ||
        (targetOldSlugName && slugId === targetOldSlugName) ||
        (targetOldSlugName && slugName === targetOldSlugName);

      if (matches) {
        batch.update(uDoc.ref, {
          collegeId: isExternal ? normalizedNewName : (uColId || collegeId),
          collegeName: normalizedNewName,
          displayName: uData.role === "college_admin" ? `${normalizedNewName} admin` : (uData.displayName || "User"),
          updatedAt: Timestamp.now(),
        });
      }
    });
  });

  // Update exams for this college
  const examQueries = [query(collection(db, "exams"), where("collegeId", "==", collegeId))];
  if (oldName) examQueries.push(query(collection(db, "exams"), where("collegeName", "==", oldName)));
  
  const examSnaps = await Promise.all(examQueries.map(q => getDocs(q)));
  const processedExamIds = new Set<string>();

  examSnaps.forEach(snap => {
    snap.docs.forEach((exDoc) => {
      if (processedExamIds.has(exDoc.id)) return;
      processedExamIds.add(exDoc.id);
      
      const eData = exDoc.data();
      const eColId = eData?.collegeId || "";
      const eColName = eData?.collegeName || "";
      const slugId = cleanSlug(eColId);
      const slugName = cleanSlug(eColName);

      const matches =
        eColId === collegeId ||
        eColName === oldName ||
        eColId === oldName ||
        eColName === collegeId ||
        (targetOldSlugId && slugId === targetOldSlugId) ||
        (targetOldSlugId && slugName === targetOldSlugId) ||
        (targetOldSlugName && slugId === targetOldSlugName) ||
        (targetOldSlugName && slugName === targetOldSlugName);

      if (matches) {
        batch.update(exDoc.ref, {
          collegeName: normalizedNewName,
          collegeId: isExternal ? normalizedNewName : (eColId || collegeId),
          updatedAt: Timestamp.now(),
        });
      }
    });
  });

  // Update resources for this college
  const resourceQueries = [query(collection(db, "resources"), where("collegeId", "==", collegeId))];
  if (oldName) resourceQueries.push(query(collection(db, "resources"), where("collegeName", "==", oldName)));
  
  const resourceSnaps = await Promise.all(resourceQueries.map(q => getDocs(q)));
  const processedResourceIds = new Set<string>();

  resourceSnaps.forEach(snap => {
    snap.docs.forEach((resDoc) => {
      if (processedResourceIds.has(resDoc.id)) return;
      processedResourceIds.add(resDoc.id);
      
      const rData = resDoc.data();
      const rColId = rData?.collegeId || "";
      const rColName = rData?.collegeName || "";
      const slugId = cleanSlug(rColId);
      const slugName = cleanSlug(rColName);

      const matches =
        rColId === collegeId ||
        rColName === oldName ||
        rColId === oldName ||
        rColName === collegeId ||
        (targetOldSlugId && slugId === targetOldSlugId) ||
        (targetOldSlugId && slugName === targetOldSlugId) ||
        (targetOldSlugName && slugId === targetOldSlugName) ||
        (targetOldSlugName && slugName === targetOldSlugName);

      if (matches) {
        batch.update(resDoc.ref, {
          collegeName: normalizedNewName,
          collegeId: isExternal ? normalizedNewName : (rColId || collegeId),
          updatedAt: Timestamp.now(),
        });
      }
    });
  });

  await batch.commit();
}

/**
 * Delete a department and migrate students to General
 */
export async function deleteDepartmentAndMigrate(
  collegeId: string,
  departmentName: string
): Promise<void> {
  const batch = new ChunkedBatch(db);

  // Update college document - remove department
  const collegeRef = doc(db, "colleges", collegeId);
  const collegeSnap = await getDoc(collegeRef);
  if (collegeSnap.exists()) {
    const collegeData = collegeSnap.data();
    const departments = (collegeData.departments || []).filter((d: string) => d !== departmentName);
    batch.update(collegeRef, {
      departments,
      updatedAt: Timestamp.now(),
    });
  }

  // Migrate students to General department
  const studentsQuery = query(
    collection(db, "students"),
    where("collegeId", "==", collegeId),
    where("department", "==", departmentName)
  );

  const studentsSnap = await getDocs(studentsQuery);
  studentsSnap.docs.forEach((studentDoc) => {
    batch.update(studentDoc.ref, {
      department: "General",
      updatedAt: Timestamp.now(),
    });
  });

  await batch.commit();
}

/**
 * Rename a department and migrate all student references
 */
export async function renameDepartmentAndMigrate(
  collegeId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const batch = new ChunkedBatch(db);

  // Update college document
  const collegeRef = doc(db, "colleges", collegeId);
  const collegeSnap = await getDoc(collegeRef);
  if (collegeSnap.exists()) {
    const collegeData = collegeSnap.data();
    const departments = (collegeData.departments || []).map((d: string) =>
      d === oldName ? newName : d
    );
    batch.update(collegeRef, {
      departments,
      updatedAt: Timestamp.now(),
    });
  }

  // Update all students
  const studentsQuery = query(
    collection(db, "students"),
    where("collegeId", "==", collegeId),
    where("department", "==", oldName)
  );

  const studentsSnap = await getDocs(studentsQuery);
  studentsSnap.docs.forEach((studentDoc) => {
    batch.update(studentDoc.ref, {
      department: newName,
      updatedAt: Timestamp.now(),
    });
  });

  await batch.commit();
}
