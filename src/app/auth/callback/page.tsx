"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { syncGoogleUserAction } from "@/lib/actions/auth-actions";
import { setAuthSession } from "@/lib/utils/auth-session";
import type { UserRole } from "@/types";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string>("Authenticating with Google...");
  const processedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function processUser(user: any) {
      if (processedRef.current) return;
      processedRef.current = true;

      setStatus("Setting up your student profile...");
      try {
        const mode = (searchParams.get("mode") || (typeof window !== "undefined" ? localStorage.getItem("oauth_mode") : null) || "login") as "login" | "register";
        
        const syncRes = await syncGoogleUserAction(user, mode);

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

        setStatus("Redirecting to your dashboard...");
        const targetPath = syncRes.targetPath || (role === "student" ? "/student" : (role === "college_admin" ? "/" : "/admin"));
        window.location.replace(targetPath);
      } catch (err: any) {
        console.error("Profile sync error:", err);
        window.location.replace(`/login?error=${encodeURIComponent(err?.message || "sync_failed")}`);
      }
    }

    async function handleAuth() {
      // 1. Check for URL error parameters
      const urlError = searchParams.get("error_description") || searchParams.get("error");
      if (urlError) {
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
      const timeout = setTimeout(() => {
        if (mounted && !processedRef.current) {
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
    <div className="min-h-screen bg-[#090d16] text-white flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 border-3 border-white/20 border-t-brand rounded-full animate-spin mx-auto" />
        <h2 className="text-lg font-bold font-heading">{status}</h2>
        <p className="text-xs text-muted-foreground">Please wait while we verify your academic credentials.</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#090d16] text-white flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white/20 border-t-brand rounded-full animate-spin" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
