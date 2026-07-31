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
import { getDocuments, subscribeToDocuments } from "@/lib/firebase/firestore";
import type { College } from "@/types";

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
export async function fetchColleges(): Promise<College[]> {
  return getDocuments<College>("colleges", [orderBy("createdAt", "desc")]);
}

/**
 * Get all colleges (alias for consistency)
 */
export const getAllColleges = fetchColleges;

/**
 * Subscribe to all colleges with real-time updates
 */
export function subscribeToAllColleges(callback: (colleges: College[]) => void): () => void {
  return subscribeToDocuments<College>("colleges", callback, [orderBy("createdAt", "desc")]);
}

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

/**
 * ⚠️ CRITICAL FIX: Delete college with proper error handling
 * NO SILENT FAILURES - All errors propagate to caller
 */
export async function deleteCollege(id: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("User must be authenticated to delete colleges");
  }

  const adminIdToken = await currentUser.getIdToken(true);

  const response = await fetch("/api/admin/delete-college", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, adminIdToken }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.error ||
      data.message ||
      `Failed to delete college: ${response.status} ${response.statusText}`
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
  const batch = writeBatch(db);
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

  // Fetch all students to ensure clean slug match captures every single student
  const allStudentsSnap = await getDocs(collection(db, "students"));
  allStudentsSnap.docs.forEach((studentDoc) => {
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

      // Also sync user document in users collection if present
      const userRef = doc(db, "users", studentDoc.id);
      batch.set(
        userRef,
        {
          collegeId: isExternal ? normalizedNewName : (sColId || collegeId),
          collegeName: normalizedNewName,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    }
  });

  // Update exams for this college
  const examsSnap = await getDocs(collection(db, "exams"));
  examsSnap.docs.forEach((exDoc) => {
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

  // Update resources for this college
  const resourcesSnap = await getDocs(collection(db, "resources"));
  resourcesSnap.docs.forEach((resDoc) => {
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

  await batch.commit();
}

/**
 * Delete a department and migrate students to General
 */
export async function deleteDepartmentAndMigrate(
  collegeId: string,
  departmentName: string
): Promise<void> {
  const batch = writeBatch(db);

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
  const batch = writeBatch(db);

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
