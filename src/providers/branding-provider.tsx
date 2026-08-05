"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { doc, onSnapshot, getDoc, getDocuments, where } from "@/lib/firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { CompanyBranding, subscribeToCompanyBranding } from "@/lib/services/branding-service";
import { getCurrentUser } from "@/lib/utils/auth-session";

export interface BrandingContextType {
  branding: CompanyBranding;
  loading: boolean;
}

const emptyBranding: CompanyBranding = {
  companyName: "",
  companySubtitle: "",
  logoBase64: "",
};

const BrandingContext = createContext<BrandingContextType>({
  branding: emptyBranding,
  loading: true,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [tenantBranding, setTenantBranding] = useState<CompanyBranding | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem("lms_college_branding");
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.branding || null;
      }
    } catch {}
    return null;
  });
  const [masterBranding, setMasterBranding] = useState<CompanyBranding | null>(null);
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const cached = localStorage.getItem("lms_college_branding");
    return !cached;
  });

  useEffect(() => {
    let unsubCollege: (() => void) | null = null;
    let unsubMaster: (() => void) | null = null;
    let isCancelled = false;

    const initBranding = async () => {
      try {
        await getCurrentUser(); // Ensure Firebase Auth is fully initialized to prevent permission errors
        
        if (!auth.currentUser) {
          // If we are not authenticated with Firebase Auth, any Firestore read will fail with missing permissions.
          // Fallback to master branding only.
          unsubMaster = subscribeToCompanyBranding((b) => {
            if (!isCancelled) {
              setMasterBranding(b);
              setLoading(false);
            }
          });
          return;
        }

        const storedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const userRole = localStorage.getItem("lms_role");

        if (storedUser) {
          const profile = JSON.parse(storedUser);
          const collegeId = profile.collegeId;

          // Resolve exact college document ID and subscribe to colleges/{targetColId}
          // Rely on lms-data-cache to populate collegeId in localStorage.
          if (collegeId && collegeId !== "global") {
            const colRef = doc(db, "colleges", collegeId);
            unsubCollege = onSnapshot(colRef, (snap) => {
              if (isCancelled) return;
              if (snap.exists()) {
                const data = snap.data();
                const officialColName = data.name?.trim() || profile.collegeName?.trim() || "College Portal";
                const cBrand: CompanyBranding = {
                  companyName: officialColName,
                  companySubtitle: data.branding?.companySubtitle?.trim() || `${officialColName} Portal`,
                  logoBase64: data.branding?.logoBase64 || "",
                };
                setTenantBranding(cBrand);
                localStorage.setItem("lms_college_branding", JSON.stringify({ collegeId: collegeId, branding: cBrand }));
              } else {
                const fallbackName = profile.collegeName?.trim() || "College Portal";
                setTenantBranding({
                  companyName: fallbackName,
                  companySubtitle: `${fallbackName} Portal`,
                  logoBase64: "",
                });
              }
              setLoading(false);
            }, (err) => {
              console.error("College branding subscription error:", err);
              if (!isCancelled) setLoading(false);
            });

            return;
          }
        }

        // ONLY for Super Admin / Global user (no collegeId or collegeId === "global")
        if (userRole === "admin" || userRole === "trainer") {
          unsubMaster = subscribeToCompanyBranding((data) => {
            if (!isCancelled) {
              setMasterBranding({
                companyName: data.companyName || "Enterprise LMS",
                companySubtitle: data.companySubtitle || "Master Admin",
                logoBase64: data.logoBase64 || "",
              });
              setLoading(false);
            }
          });
        } else {
          if (!isCancelled) setLoading(false);
        }
      } catch (err) {
        console.error("BrandingProvider error:", err);
        if (!isCancelled) setLoading(false);
      }
    };

    initBranding();

    const handleStorageChange = () => {
      initBranding();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      isCancelled = true;
      if (unsubCollege) unsubCollege();
      if (unsubMaster) unsubMaster();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const activeBranding = tenantBranding || masterBranding || emptyBranding;

  return (
    <BrandingContext.Provider value={{ branding: activeBranding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
