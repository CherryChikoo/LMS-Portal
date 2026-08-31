/**
 * Inactivity-based session timeout manager.
 *
 * Tracks user activity (mouse, keyboard, scroll, touch) and automatically
 * logs the user out after a configured period of inactivity.
 *
 * The "last active" timestamp is stored in localStorage so it persists
 * across page reloads and is shared across browser tabs.
 */

const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const ACTIVITY_KEY = "lms_last_active";
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const THROTTLE_MS = 30 * 1000; // Only write to localStorage every 30s to reduce overhead

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _lastWriteTs = 0;
let _initialized = false;

/** Record user activity (throttled to avoid localStorage spam). */
function recordActivity() {
  const now = Date.now();
  if (now - _lastWriteTs < THROTTLE_MS) return;
  _lastWriteTs = now;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/** Get the timestamp of the last recorded activity. */
function getLastActive(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (raw) return parseInt(raw, 10) || Date.now();
  } catch {}
  return Date.now();
}

/** Check if the session has timed out and log the user out if so. */
async function checkTimeout() {
  if (typeof window === "undefined") return;

  // Don't log out if we're already logging out
  if ((window as any).__isLoggingOut) return;

  const lastActive = getLastActive();
  const elapsed = Date.now() - lastActive;

  if (elapsed >= INACTIVITY_TIMEOUT_MS) {
    console.log(`[Session Timeout] Inactive for ${Math.round(elapsed / 60000)} minutes. Logging out.`);
    stop(); // Stop checking before triggering logout
    const { clearAuthSession } = await import("@/lib/utils/auth-session");
    await clearAuthSession("/login?error=session_timeout");
  }
}

/** Attach activity listeners and start the periodic timeout check. */
export function startInactivityTracker() {
  if (typeof window === "undefined" || _initialized) return;
  _initialized = true;

  // Record initial activity on mount
  recordActivity();

  // Track user interactions
  const events: (keyof WindowEventMap)[] = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
    "pointerdown",
  ];

  events.forEach((evt) => {
    window.addEventListener(evt, recordActivity, { passive: true, capture: true });
  });

  // Also record activity on page visibility changes (user switches back to this tab)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // When user returns to tab, first check if we've timed out while away
      checkTimeout();
      recordActivity();
    }
  });

  // Periodic check
  _intervalId = setInterval(checkTimeout, CHECK_INTERVAL_MS);
}

/** Stop the inactivity tracker (call on logout). */
export function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _initialized = false;
}

/** Reset the inactivity timer (call on fresh login). */
export function resetInactivityTimer() {
  _lastWriteTs = 0; // Force an immediate write
  recordActivity();
}
