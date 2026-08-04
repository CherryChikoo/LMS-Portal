import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, WhereFilterOp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export async function bulkDeleteByQuery(
  collectionName: string,
  field: string,
  operator: WhereFilterOp,
  value: any
): Promise<number> {
  const db = getFirestore(getAdminApp());
  let deletedCount = 0;

  try {
    const querySnapshot = await db.collection(collectionName).where(field, operator, value).get();
    
    if (querySnapshot.empty) return 0;

    const bulkWriter = db.bulkWriter();
    
    querySnapshot.docs.forEach((doc) => {
      bulkWriter.delete(doc.ref);
      deletedCount++;
    });

    await bulkWriter.close();
    return deletedCount;
  } catch (error) {
    console.error(`[CleanupService] bulkDeleteByQuery failed for ${collectionName}:`, error);
    throw error;
  }
}

export async function deleteDocumentAdmin(collectionName: string, id: string): Promise<void> {
  const db = getFirestore(getAdminApp());
  try {
    await db.collection(collectionName).doc(id).delete();
  } catch (error) {
    console.error(`[CleanupService] deleteDocumentAdmin failed for ${collectionName}/${id}:`, error);
    throw error;
  }
}

export async function deleteStorageDirectory(prefix: string): Promise<void> {
  try {
    const bucket = getStorage(getAdminApp()).bucket();
    if (bucket) {
      // prefix should end with '/' for directories
      await bucket.deleteFiles({ prefix });
    }
  } catch (error) {
    console.warn(`[CleanupService] deleteStorageDirectory warning for prefix ${prefix}:`, error);
    // Non-fatal, storage might be empty
  }
}

export async function deleteStorageFileByUrl(fileUrl: string): Promise<void> {
  if (!fileUrl) return;
  try {
    const bucket = getStorage(getAdminApp()).bucket();
    if (!bucket) return;
    
    // Extract the path from standard Firebase Storage HTTP URLs
    // e.g. https://firebasestorage.googleapis.com/v0/b/project.appspot.com/o/users%2Fabc%2Fprofile.jpg?alt=media
    let filePath = "";
    if (fileUrl.includes("/o/")) {
      filePath = fileUrl.split("/o/")[1].split("?")[0];
      filePath = decodeURIComponent(filePath);
    } else {
      filePath = decodeURIComponent(fileUrl);
    }

    if (filePath) {
      await bucket.file(filePath).delete();
    }
  } catch (error) {
    console.warn(`[CleanupService] deleteStorageFile warning for URL ${fileUrl}:`, error);
    // Non-fatal
  }
}
