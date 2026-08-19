"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { syncGoogleUserAction } from "@/lib/actions/auth-actions";
import { setAuthSession } from "@/lib/utils/auth-session";
import type { UserRole } from "@/types";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function processUser(user: any) {
      if (processedRef.current) return;
      processedRef.current = true;

      try {
        const mode = (searchParams.get("mode") || (typeof window !== "undefined" ? localStorage.getItem("oauth_mode") : null) || "login") as "login" | "register";
        
        const syncRes = await syncGoogleUserAction(user, mode);

        if (syncRes.error === "needs_registration_completion") {
          // Google OAuth user needs to complete Step 2 (academic details) in registration flow
          // Store user info in sessionStorage for the registration page to use
          if (typeof window !== "undefined") {
            sessionStorage.setItem("oauth_pending_user", JSON.stringify({
              email: user.email || "",
              name: user.user_metadata?.full_name || user.user_metadata?.name || "",
              authId: user.id,
              provider: "google"
            }));
          }
          await supabase.auth.signOut().catch(() => {});
          window.location.replace("/register?oauth_pending=true");
          return;
        }
        if (syncRes.error === "no_account_found") {
          await supabase.auth.signOut().catch(() => {});
          window.location.replace("/login?error=no_account");
          return;
        }
        if (syncRes.error === "already_registered") {
          await supabase.auth.signOut().catch(() => {});
          window.location.replace("/login?error=already_registered");
          return;
        }
        if (syncRes.error === "restricted") {
          await supabase.auth.signOut().catch(() => {});
          window.location.replace("/login?error=restricted");
          return;
        }
        if (syncRes.error === "account_deleted") {
          await supabase.auth.signOut().catch(() => {});
          window.location.replace("/login?error=account_deleted");
          return;
        }

        const role = (syncRes.role || "student") as UserRole;
        if (syncRes.userProfile) {
          await setAuthSession(syncRes.userProfile, role);
        }

        // Check if this was an account linking (not a new registration)
        const wasLinked = syncRes.wasLinked || false;
        const targetPath = syncRes.targetPath || (role === "student" ? "/student" : (role === "college_admin" ? "/" : "/admin"));
        
        if (wasLinked) {
          // Add a success parameter to show account was linked
          window.location.replace(`${targetPath}?linked=google`);
        } else {
          window.location.replace(targetPath);
        }
      } catch (err: any) {
        console.error("Profile sync error:", err);
        await supabase.auth.signOut().catch(() => {});
        window.location.replace(`/login?error=${encodeURIComponent(err?.message || "sync_failed")}`);
      }
    }

    async function handleAuth() {
      // 1. Check for URL error parameters
      const urlError = searchParams.get("error_description") || searchParams.get("error");
      if (urlError) {
        await supabase.auth.signOut().catch(() => {});
        window.location.replace(`/login?error=${encodeURIComponent(urlError)}`);
        return;
      }

      // 2. Check for PKCE query code
      const code = searchParams.get("code");
      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (data?.session?.user && mounted) {
            await processUser(data.session.user);
            return;
          }
        } catch (e) {
          console.warn("exchangeCodeForSession error, checking getSession:", e);
        }
      }

      // 3. Check for existing session or hash fragment tokens
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && mounted) {
        await processUser(session.user);
        return;
      }

      // 4. Set up onAuthStateChange listener for implicit hash flow
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
        if (currentSession?.user && mounted) {
          await processUser(currentSession.user);
        }
      });

      // 5. Fallback timer if OAuth token takes too long
      const timeout = setTimeout(async () => {
        if (mounted && !processedRef.current) {
          await supabase.auth.signOut().catch(() => {});
          window.location.replace("/login?error=oauth_timeout");
        }
      }, 7000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    }

    handleAuth();

    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

  return (
    <div className="fixed inset-0 bg-[#090d16]">
      {/* Invisible processing - no UI shown to user */}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-[#090d16]">
        {/* Invisible fallback - no UI shown */}
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
