import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

/**
 * OPTIMIZATION: Deletes documents matching a query using Prisma
 */
export async function bulkDeleteByQuery(
  collectionName: string,
  field: string,
  operator: string,
  value: any,
  options?: { batchSize?: number }
): Promise<number> {
  try {
    const model = (prisma as any)[collectionName];
    if (!model) {
      throw new Error(`Model ${collectionName} does not exist in Prisma schema`);
    }

    let prismaWhere: any = {};
    
    // Map Firebase operators to Prisma
    switch (operator) {
      case '==':
        prismaWhere[field] = value;
        break;
      case 'in':
        prismaWhere[field] = { in: Array.isArray(value) ? value : [value] };
        break;
      case 'array-contains':
        // Prisma array contains (PostgreSQL)
        prismaWhere[field] = { has: value };
        break;
      case 'array-contains-any':
        prismaWhere[field] = { hasSome: Array.isArray(value) ? value : [value] };
        break;
      default:
        prismaWhere[field] = value;
    }

    const result = await model.deleteMany({
      where: prismaWhere
    });
    
    console.log(`[CleanupService] bulkDeleteByQuery complete: ${result.count} docs deleted from ${collectionName}`);
    return result.count || 0;
  } catch (error) {
    console.error(`[CleanupService] bulkDeleteByQuery failed for ${collectionName}:`, error);
    throw error;
  }
}

export async function deleteDocumentAdmin(collectionName: string, id: string): Promise<void> {
  try {
    const model = (prisma as any)[collectionName];
    if (!model) {
      throw new Error(`Model ${collectionName} does not exist in Prisma schema`);
    }
    await model.delete({
      where: { id }
    });
  } catch (error) {
    console.error(`[CleanupService] deleteDocumentAdmin failed for ${collectionName}/${id}:`, error);
    throw error;
  }
}

export async function deleteStorageDirectory(prefix: string): Promise<void> {
  try {
    const BUCKET = 'lms-storage';
    // List all files in the directory
    const { data: files, error: listError } = await supabaseAdmin.storage.from(BUCKET).list(prefix, {
      limit: 100,
      offset: 0,
    });
    
    if (listError) throw listError;
    
    if (files && files.length > 0) {
      // Exclude the folder placeholder itself if Supabase returns it
      const pathsToDelete = files
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => `${prefix}${prefix.endsWith('/') ? '' : '/'}${f.name}`);
      if (pathsToDelete.length > 0) {
        const { error: deleteError } = await supabaseAdmin.storage.from(BUCKET).remove(pathsToDelete);
        if (deleteError) throw deleteError;
      }
    }
  } catch (error) {
    console.warn(`[CleanupService] deleteStorageDirectory warning for prefix ${prefix}:`, error);
    // Non-fatal, storage might be empty
  }
}

export async function deleteStorageFileByUrl(fileUrl: string): Promise<void> {
  if (!fileUrl) return;
  try {
    const BUCKET = 'lms-storage';
    
    let filePath = "";
    if (fileUrl.includes(BUCKET)) {
      filePath = fileUrl.split(`${BUCKET}/`)[1]?.split("?")[0];
    } else {
      filePath = decodeURIComponent(fileUrl);
    }

    if (filePath) {
      const { error } = await supabaseAdmin.storage.from(BUCKET).remove([filePath]);
      if (error) throw error;
    }
  } catch (error) {
    console.warn(`[CleanupService] deleteStorageFile warning for URL ${fileUrl}:`, error);
    // Non-fatal
  }
}
