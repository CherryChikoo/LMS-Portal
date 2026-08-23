import type { Batch } from "@/types";
import { globalLoading } from "@/providers/global-loading-provider";
import {
  getAllBatchesAction,
  getAllBatchesOptimizedAction,
  getBatchByIdAction,
  getBatchWithStudentsAction,
  getBatchesByCollegeAction,
  createBatchAction,
  updateBatchAction,
  deleteBatchAction,
  bulkAddStudentsToBatchAction,
  bulkRemoveStudentsFromBatchAction,
  getStudentsInBatchAction,
} from "@/lib/actions/batch-actions";

function mapBatchRow(row: any): Batch {
  if (!row) return row;
  const studentIds = Array.isArray(row.student_batches)
    ? row.student_batches.map((sb: any) => sb.studentId)
    : (row.studentIds || []);
  const studentCount = row._count?.student_batches ?? row.student_batches?.length ?? row.studentCount ?? studentIds.length ?? 0;
  return {
    ...row,
    studentCount,
    studentIds,
  } as Batch;
}

/**
 * OPTIMIZED: Get all batches with student counts (no student IDs)
 * Use getBatchWithStudents(batchId) to load student IDs for a specific batch when needed
 */
export async function getAllBatches(): Promise<{ data: Batch[], lastDoc: any }> {
  const data = await getAllBatchesOptimizedAction();
  const parsedData = JSON.parse(JSON.stringify(data));
  const mappedData = parsedData.map((batch: any) => ({
    ...batch,
    studentCount: batch._count?.student_batches ?? 0,
    studentIds: [], // Empty - use getBatchWithStudents() to load when needed
    collegeName: batch.colleges?.name || null,
  }));
  return { data: mappedData, lastDoc: mappedData.length > 0 ? mappedData[mappedData.length - 1] : null };
}

/**
 * Get a single batch with all enrolled student IDs
 */
export async function getBatchWithStudents(id: string): Promise<Batch | null> {
  const data = await getBatchWithStudentsAction(id);
  if (!data) return null;
  return mapBatchRow(JSON.parse(JSON.stringify(data)));
}

export async function getBatchById(id: string): Promise<Batch | null> {
  const data = await getBatchByIdAction(id);
  if (!data) return null;
  return mapBatchRow(JSON.parse(JSON.stringify(data)));
}

export async function getBatchesByCollege(collegeId: string): Promise<{ data: Batch[], lastDoc: any }> {
  const data = await getBatchesByCollegeAction(collegeId);
  const parsedData = JSON.parse(JSON.stringify(data));
  const mappedData = parsedData.map(mapBatchRow);
  return { data: mappedData, lastDoc: mappedData.length > 0 ? mappedData[mappedData.length - 1] : null };
}

import { refreshCache, optimisticAddBatchToCache, optimisticUpdateBatchInCache, optimisticDeleteBatchFromCache } from "@/lib/data/lms-data-cache";

export async function createBatch(data: Partial<Batch>): Promise<string> {
  return await globalLoading.wrap(async () => {
    const batchData = {
      ...data,
      id: data.id || `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const id = await createBatchAction(batchData);
    try {
      optimisticAddBatchToCache({ ...batchData, id } as Batch);
      refreshCache().catch(() => {});
    } catch (_) {}
    return id;
  }, `Creating batch "${data.name || "New Batch"}"...`);
}

export async function updateBatch(
  id: string,
  data: Partial<Batch>
): Promise<void> {
  return await globalLoading.wrap(async () => {
    try {
      optimisticUpdateBatchInCache(id, data);
    } catch (_) {}
    await updateBatchAction(id, { ...data, updatedAt: new Date() });
    try {
      refreshCache().catch(() => {});
    } catch (_) {}
  }, "Updating batch details...");
}

export async function deleteBatch(id: string): Promise<void> {
  return await globalLoading.wrap(async () => {
    try {
      optimisticDeleteBatchFromCache(id);
    } catch (_) {}
    await deleteBatchAction(id);
    try {
      refreshCache().catch(() => {});
    } catch (_) {}
  }, "Deleting batch...");
}

export async function bulkAddStudentsToBatch(batchIdOrName: string, studentIds: string[]): Promise<void> {
  return await globalLoading.wrap(async () => {
    await bulkAddStudentsToBatchAction(batchIdOrName, studentIds);
    try {
      refreshCache().catch(() => {});
    } catch (_) {}
  }, `Enrolling ${studentIds.length} student(s) into batch...`);
}

export async function bulkRemoveStudentsFromBatch(batchIdOrName: string, studentIds: string[]): Promise<void> {
  return await globalLoading.wrap(async () => {
    await bulkRemoveStudentsFromBatchAction(batchIdOrName, studentIds);
    try {
      refreshCache().catch(() => {});
    } catch (_) {}
  }, `Removing ${studentIds.length} student(s) from batch...`);
}

export async function getStudentsInBatch(batchId: string) {
  const students = await getStudentsInBatchAction(batchId);
  return students;
}
