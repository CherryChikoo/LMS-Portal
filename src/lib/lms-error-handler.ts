import { AuthError } from "@supabase/supabase-js";

export interface LmsError {
  code: string;
  message: string;
  details?: string;
  originalError?: any;
}

export interface ParsedError {
  title: string;
  message: string;
  cause: string;
  action: string;
  category: "authentication" | "permission" | "validation" | "network" | "server" | "unknown";
  isRetryable: boolean;
  errorCode: string;
}

/**
 * Extract Firebase error code from various error formats
 */
function extractErrorCode(error: unknown): string {
  if (!error) return "unknown";

  if (error instanceof AuthError) {
    return error.code || "auth/unknown";
  }

  if (typeof error === "object" && error !== null) {
    const errorObj = error as any;
    if (errorObj.code && typeof errorObj.code === "string") {
      return errorObj.code;
    }
  }

  return "unknown";
}

/**
 * Extract error message from various error formats
 */
function extractErrorMessage(error: unknown): string {
  if (!error) return "An unknown error occurred";

  if (typeof error === "string") return error;

  if (typeof error === "object" && error !== null) {
    const errorObj = error as any;
    if (errorObj.message && typeof errorObj.message === "string") return errorObj.message;
    if (errorObj.error && typeof errorObj.error === "string") return errorObj.error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * ⚠️ CRITICAL FIX: Parse and normalize Firebase errors into ParsedError format
 * NEVER returns empty objects - always returns meaningful error information
 */
export function parseLmsError(error: unknown): ParsedError {
  const code = extractErrorCode(error);
  const message = extractErrorMessage(error);
  const strError = message.toLowerCase();

  // ACCESS DENIED ERRORS
  if (strError.includes("access denied") || strError.includes("not registered in the lms")) {
    return {
      title: "Access Denied",
      message: message.replace(/^Error:\s*/i, "").trim(),
      cause: "",
      action: "",
      category: "authentication",
      isRetryable: false,
      errorCode: "",
    };
  }

  // AUTHENTICATION ERRORS
  if (code.startsWith("auth/") || strError.includes("credential") || strError.includes("sign-in") || strError.includes("user record") || strError.includes("user-not-found")) {
    const activeCode = (strError.includes("user record") || strError.includes("user-not-found")) ? "auth/user-not-found" : code;
    const authMessages: Record<string, string> = {
      "auth/invalid-email": "Email format is invalid.",
      "auth/user-disabled": "Your account has been disabled.",
      "auth/user-not-found": "No account exists with this email address or identifier.",
      "auth/wrong-password": "Incorrect password.",
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/email-already-exists": "An account with this email already exists.",
      "auth/weak-password": "Password does not meet requirements.",
      "auth/invalid-credential": "Invalid login credentials.",
      "auth/too-many-requests": "Too many login attempts. Please try again later.",
      "auth/network-request-failed": "Network error. Check your internet connection.",
      "auth/popup-closed-by-user": "The sign-in popup was closed before completing.",
      "auth/popup-blocked": "Sign-in popup was blocked by the browser.",
      "auth/requires-recent-login": "Your session has expired. Please log in again.",
      "auth/account-exists-with-different-credential": "An account already exists with the same email but different sign-in method.",
      "auth/internal-error": "An internal authentication error occurred.",
    };

    return {
      title: "Authentication Notice",
      message: authMessages[activeCode] || message,
      cause: "Your credentials could not be found or verified in the system.",
      action: "Double-check your email and password, or contact your administrator to ensure your account is set up.",
      category: "authentication",
      isRetryable: activeCode !== "auth/user-disabled" && activeCode !== "auth/email-already-in-use" && activeCode !== "auth/email-already-exists",
      errorCode: activeCode,
    };
  }

  // NETWORK ERRORS
  if (code === "unavailable" || code === "deadline-exceeded" || code === "network-error" || strError.includes("network") || strError.includes("offline") || strError.includes("timed out") || strError.includes("timeout")) {
    return {
      title: "Connection Error",
      message: "Unable to reach the server.",
      cause: "Internet connection lost, or server service is unavailable.",
      action: "Check your Wi-Fi or mobile data, then try again.",
      category: "network",
      isRetryable: true,
      errorCode: code,
    };
  }

  // PERMISSION ERRORS
  if (code === "permission-denied" || code === "unauthenticated" || strError.includes("permission") || strError.includes("unauthorized") || strError.includes("insufficient")) {
    let explicitMessage = "You do not have permission to perform this action.";
    if (strError.includes("create student")) explicitMessage = "You don't have permission to create students in this college.";
    if (strError.includes("edit exam")) explicitMessage = "You don't have permission to edit this exam.";
    if (strError.includes("belongs to another")) explicitMessage = "This resource belongs to another college.";
    
    return {
      title: "Permission Denied",
      message: explicitMessage,
      cause: "Your role does not grant you access to this specific record or operation.",
      action: "Contact the system administrator if you believe this is incorrect.",
      category: "permission",
      isRetryable: false,
      errorCode: code,
    };
  }

  // VALIDATION ERRORS
  if (code === "invalid-argument" || strError.includes("must be") || strError.includes("required") || strError.includes("invalid") || strError.includes("at least")) {
    return {
      title: "Validation Error",
      message: message,
      cause: "Required information is missing or incorrectly formatted.",
      action: "Review the form fields and correct any highlighted errors.",
      category: "validation",
      isRetryable: false,
      errorCode: code,
    };
  }

  // ALREADY EXISTS
  if (code === "already-exists" || strError.includes("already exists")) {
    return {
      title: "Record Exists",
      message: "This record already exists.",
      cause: "A record with the exact same details is already present.",
      action: "Try using different information or edit the existing record.",
      category: "validation",
      isRetryable: false,
      errorCode: code,
    };
  }

  // FAILED PRECONDITION
  if (code === "failed-precondition") {
    return {
      title: "Operation Failed",
      message: "The requested operation could not be completed in the current state.",
      cause: "The state of the data prevents this action (e.g. attempting to operate on an incomplete record).",
      action: "Refresh the page or verify the data before trying again.",
      category: "server",
      isRetryable: true,
      errorCode: code,
    };
  }

  // NOT FOUND
  if (code === "not-found" || strError.includes("not found")) {
    return {
      title: "Record Not Found",
      message: "The requested resource could not be found.",
      cause: "The item may have been deleted, or the ID is incorrect.",
      action: "Refresh the page to sync the latest data.",
      category: "server",
      isRetryable: false,
      errorCode: code,
    };
  }

  // CUSTOM API JSON ERRORS (success: false)
  if (typeof error === "object" && error !== null && ("success" in (error as any) || "error" in (error as any) || "message" in (error as any))) {
    const errObj = error as any;
    if (!code?.startsWith("auth/")) {
      const serverMsg = errObj.message || errObj.error || message;
      let finalMessage = serverMsg;
      let finalTitle = "Notice";
      let finalCause = errObj.errorCode ? `Server rejected request: ${errObj.errorCode}` : "The server rejected the operation due to invalid data or references.";
      
      if (serverMsg.toLowerCase().includes("email") && (serverMsg.toLowerCase().includes("already in use") || serverMsg.toLowerCase().includes("already associated") || serverMsg.toLowerCase().includes("already registered") || serverMsg.toLowerCase().includes("already exists"))) {
        finalTitle = "Update Failed";
        finalMessage = "Update failed: This email address is already in use by another account.";
        finalCause = "An account with this email address already exists in the system.";
      } else if (serverMsg.toLowerCase().includes("related records") || serverMsg.toLowerCase().includes("cannot delete")) {
        finalMessage = "Unable to delete because related records still exist.";
        finalCause = "The entity you are trying to delete is referenced by other active records.";
      } else if (serverMsg.toLowerCase().includes("rolled back")) {
        finalTitle = "Operation Rolled Back";
        finalMessage = "Operation rolled back successfully.";
        finalCause = "The operation encountered an error midway and was safely reversed.";
      }
      
      return {
        title: finalTitle,
        message: finalMessage,
        cause: finalCause,
        action: "Please review the information and try again.",
        category: "server",
        isRetryable: true,
        errorCode: errObj.errorCode || code,
      };
    }
  }

  // RESTRICTED / DELETED ACCOUNT
  if (strError.includes("restricted") || strError.includes("deleted")) {
    return {
      title: "Account Restricted",
      message: message,
      cause: "Your account has been restricted or deleted by an administrator.",
      action: "Contact your administrator for assistance.",
      category: "permission",
      isRetryable: false,
      errorCode: code,
    };
  }

  // FALLBACK
  return {
    title: "Something Went Wrong",
    message: message || "An unexpected error occurred.",
    cause: "An unexpected error occurred in the application.",
    action: "Please try again. If the problem persists, contact support.",
    category: "unknown",
    isRetryable: true,
    errorCode: code,
  };
}

/**
 * Check if error is a permission denied error
 */
export function isPermissionError(error: unknown): boolean {
  const code = extractErrorCode(error);
  return code === "permission-denied" ||
         code === "lms/insufficient-permissions" ||
         code === "unauthenticated";
}

/**
 * Check if error is a not found error
 */
export function isNotFoundError(error: unknown): boolean {
  const code = extractErrorCode(error);
  return code === "not-found" || code.includes("not-found");
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  const code = extractErrorCode(error);
  return code === "network-error" ||
         code === "auth/network-request-failed" ||
         code === "unavailable" ||
         code === "deadline-exceeded";
}
