export interface FirebaseErrorLike {
  code: string;
  message: string;
}

/**
 * Type guard to check if an unknown error is a Firebase Error.
 */
export function isFirebaseError(error: unknown): error is FirebaseErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  );
}

/**
 * Safely extracts a human-readable error string from an unknown catch clause error.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isFirebaseError(error)) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string;
  }
  return 'An unknown error occurred.';
}

export type ApiResponse<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };
