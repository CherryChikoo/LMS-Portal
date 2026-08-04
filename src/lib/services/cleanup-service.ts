import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, WhereFilterOp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * OPTIMIZATION: Deletes documents matching a query in paginated batches
 * Prevents memory issues and timeouts with large result sets (10,000+ docs)
 */
export async function bulkDeleteByQuery(
  collectionName: string,
  field: string,
  operator: WhereFilterOp,
  value: any,
  options?: { batchSize?: number }
): Promise<number> {
  const db = getFirestore(getAdminApp());
  const BATCH_SIZE = options?.batchSize || 500;
  let totalDeleted = 0;

  try {
    let hasMore = true;
    
    while (hasMore) {
      // Fetch next batch with limit
      const querySnapshot = await db
        .collection(collectionName)
        .where(field, operator, value)
        .limit(BATCH_SIZE)
        .get();
      
      if (querySnapshot.empty) {
        break;
      }

      const bulkWriter = db.bulkWriter();
      
      // Add retry logic for transient failures
      bulkWriter.onWriteError((error) => {
        if (error.failedAttempts < 3) return true; // Retry
        console.error(`[CleanupService] BulkWriter error after retries:`, error);
        return false; // Give up after 3 attempts
      });
      
      querySnapshot.docs.forEach((doc) => {
        bulkWriter.delete(doc.ref);
      });

      await bulkWriter.close();
      totalDeleted += querySnapshot.docs.length;
      
      console.log(`[CleanupService] Deleted batch of ${querySnapshot.docs.length} from ${collectionName}, total: ${totalDeleted}`);
      
      // If we got fewer docs than batch size, we're done
      hasMore = querySnapshot.docs.length === BATCH_SIZE;
      
      // Small delay between batches to avoid overwhelming Firestore
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[CleanupService] bulkDeleteByQuery complete: ${totalDeleted} docs deleted from ${collectionName}`);
    return totalDeleted;
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
