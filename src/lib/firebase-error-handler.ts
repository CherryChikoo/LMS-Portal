import { FirebaseError } from "firebase/app";

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
}

/**
 * Extract Firebase error code from various error formats
 */
function extractErrorCode(error: unknown): string {
  if (!error) return "unknown";

  if (error instanceof FirebaseError) {
    return error.code || "firebase/unknown";
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

  // AUTHENTICATION ERRORS
  if (code.startsWith("auth/") || strError.includes("credential") || strError.includes("sign-in")) {
    const authMessages: Record<string, string> = {
      "auth/invalid-email": "The email address is not valid.",
      "auth/user-disabled": "This account has been disabled by an administrator.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "The password is incorrect.",
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/email-already-exists": "An account with this email already exists.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-credential": "Invalid login credentials.",
      "auth/too-many-requests": "Too many failed attempts. Please wait before trying again.",
      "auth/network-request-failed": "Network error. Check your internet connection.",
      "auth/popup-closed-by-user": "The sign-in popup was closed before completing.",
      "auth/popup-blocked": "Sign-in popup was blocked by the browser.",
      "auth/requires-recent-login": "Please log in again to perform this action.",
      "auth/account-exists-with-different-credential": "An account already exists with the same email but different sign-in method.",
      "auth/internal-error": "An internal authentication error occurred.",
    };

    return {
      title: "Authentication Error",
      message: authMessages[code] || message,
      cause: "Your login credentials could not be verified, or the account state prevents this action.",
      action: "Double-check your email and password, then try again.",
      category: "authentication",
      isRetryable: code !== "auth/user-disabled" && code !== "auth/email-already-in-use" && code !== "auth/email-already-exists",
    };
  }

  // NETWORK ERRORS
  if (code === "unavailable" || code === "deadline-exceeded" || code === "network-error" || strError.includes("network") || strError.includes("offline") || strError.includes("timed out") || strError.includes("timeout")) {
    return {
      title: "Connection Error",
      message: "Unable to reach the server. Please check your internet connection.",
      cause: "Your device may be offline, or the server is temporarily unreachable.",
      action: "Check your Wi-Fi or mobile data, then try again.",
      category: "network",
      isRetryable: true,
    };
  }

  // PERMISSION ERRORS
  if (code === "permission-denied" || code === "unauthenticated" || strError.includes("permission") || strError.includes("unauthorized") || strError.includes("insufficient")) {
    return {
      title: "Permission Denied",
      message: "You do not have permission to perform this action.",
      cause: "Your role does not grant you access to this specific record or operation.",
      action: "Contact the system administrator if you believe this is incorrect.",
      category: "permission",
      isRetryable: false,
    };
  }

  // VALIDATION ERRORS
  if (code === "invalid-argument" || strError.includes("must be") || strError.includes("required") || strError.includes("invalid") || strError.includes("at least")) {
    return {
      title: "Validation Error",
      message: message,
      cause: "One or more fields contain invalid or missing data.",
      action: "Review the form fields and correct any highlighted errors.",
      category: "validation",
      isRetryable: false,
    };
  }

  // NOT FOUND
  if (code === "not-found" || strError.includes("not found")) {
    return {
      title: "Record Not Found",
      message: "The requested record could not be found.",
      cause: "The item may have been deleted, or the ID is incorrect.",
      action: "Refresh the page to sync the latest data.",
      category: "server",
      isRetryable: false,
    };
  }

  // CUSTOM API JSON ERRORS (success: false)
  if (typeof error === "object" && error !== null && ("success" in (error as any) || "error" in (error as any) || "message" in (error as any))) {
    const errObj = error as any;
    if (!code?.startsWith("auth/")) {
      return {
        title: "Operation Failed",
        message: errObj.message || errObj.error || message,
        cause: errObj.errorCode ? `Server rejected request: ${errObj.errorCode}` : "The server rejected the operation due to invalid data.",
        action: "Please review the information and try again.",
        category: "server",
        isRetryable: true,
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
