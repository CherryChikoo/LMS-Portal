"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { syncGoogleUserAction } from "@/lib/actions/auth-actions";
import { setAuthSession } from "@/lib/utils/auth-session";
import type { UserRole } from "@/types";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string>("Authenticating with Google...");

  useEffect(() => {
    let mounted = true;

    async function handleAuth() {
      try {
        const code = searchParams.get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          // Listen to onAuthStateChange for hash fragment token exchange
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            if (currentSession?.user && mounted) {
              await processUser(currentSession.user);
            }
          });

          // Timeout fallback if no session after 6 seconds
          setTimeout(() => {
            if (mounted && !session?.user) {
              window.location.replace("/login?error=oauth_timeout");
            }
          }, 6000);
          return;
        }

        if (mounted) {
          await processUser(session.user);
        }
      } catch (err: any) {
        console.error("Auth callback error:", err);
        window.location.replace(`/login?error=${encodeURIComponent(err?.message || "oauth_failed")}`);
      }
    }

    async function processUser(user: any) {
      setStatus("Setting up your profile...");
      const syncRes = await syncGoogleUserAction(user);

      if (syncRes.error === "restricted") {
        window.location.replace("/login?error=restricted");
        return;
      }
      if (syncRes.error === "account_deleted") {
        window.location.replace("/login?error=account_deleted");
        return;
      }

      const role = (syncRes.role || "student") as UserRole;
      if (syncRes.userProfile) {
        await setAuthSession(syncRes.userProfile, role);
      }

      setStatus("Redirecting to dashboard...");
      window.location.replace(syncRes.targetPath || "/student");
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
