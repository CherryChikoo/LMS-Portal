/**
 * Utility functions for serializing Prisma data for Next.js Client Components
 * 
 * Next.js requires all data passed from Server Components to Client Components
 * to be JSON-serializable. Prisma returns Decimal and Date objects that need
 * to be converted.
 */

/**
 * Convert Prisma Decimal to number
 * Handles null/undefined and ensures proper type conversion
 */
export function decimalToNumber(value: any | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  
  // If already a number, return it
  if (typeof value === 'number') return value;
  
  // Convert Decimal to string then to number to ensure proper precision
  return Number(String(value));
}

/**
 * Convert Date object to ISO string
 * Handles null/undefined and already-serialized strings
 */
export function dateToString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  
  // If already a string, return it
  if (typeof value === 'string') return value;
  
  // Convert Date to ISO string
  if (value instanceof Date) return value.toISOString();
  
  return null;
}

/**
 * Serialize exam result for client consumption
 * Converts Decimal and Date fields to JSON-serializable types
 */
export function serializeExamResult(result: any): any {
  if (!result) return null;
  
  return {
    ...result,
    // Convert Decimal fields
    score: decimalToNumber(result.score),
    totalMarks: decimalToNumber(result.totalMarks),
    percentage: decimalToNumber(result.percentage),
    
    // Convert Date fields
    createdAt: dateToString(result.createdAt),
    updatedAt: dateToString(result.updatedAt),
    submittedAt: dateToString(result.submittedAt),
    startTime: dateToString(result.startTime),
  };
}

/**
 * Serialize array of exam results
 */
export function serializeExamResults(results: any[]): any[] {
  return results.map(serializeExamResult);
}

/**
 * Generic serializer for any Prisma model
 * Automatically handles all Decimal and Date fields
 */
export function serializePrismaData<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => serializePrismaData(item)) as T;
  }
  
  const serialized: any = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Handle Decimal
    if (value && typeof value === 'object' && value.constructor?.name === 'Decimal') {
      serialized[key] = decimalToNumber(value);
    }
    // Handle Date
    else if (value instanceof Date) {
      serialized[key] = dateToString(value);
    }
    // Handle nested objects
    else if (value && typeof value === 'object') {
      serialized[key] = serializePrismaData(value);
    }
    // Handle primitives
    else {
      serialized[key] = value;
    }
  }
  
  return serialized;
}

/**
 * Type-safe wrapper for server actions that return Prisma data
 * Ensures all returned data is properly serialized
 */
export function withSerialization<T extends (...args: any[]) => Promise<any>>(
  action: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>) => {
    const result = await action(...args);
    return serializePrismaData(result);
  };
}
