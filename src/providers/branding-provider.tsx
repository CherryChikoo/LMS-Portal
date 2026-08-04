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
          let collegeId = profile.collegeId;

          // 1. Resolve missing collegeId via user document
          if (!collegeId && profile.id) {
            try {
              const uCollection = (profile.role === "student" || userRole === "student") ? "students" : "users";
              const userSnap = await getDoc(doc(db, uCollection, profile.id));
              if (userSnap.exists()) {
                const uData = userSnap.data();
                collegeId = uData.collegeId;
                if (collegeId) {
                  profile.collegeId = collegeId;
                  localStorage.setItem("lms_user", JSON.stringify(profile));
                }
              }
            } catch (e) {
              console.error("Error resolving missing collegeId via user doc:", e);
            }
          }

          // 2. Resolve missing collegeId via colleges collection lookup (adminEmail)
          // OPTIMIZATION: Only query if absolutely needed and use direct query limit
          if (!collegeId && profile.email) {
            try {
              const cleanEmail = profile.email.toLowerCase().trim();
              const colSnapsResult = await getDocuments("colleges", [where("adminEmail", "==", cleanEmail)], false, { pageSize: 1 });
              if (colSnapsResult.data.length > 0) {
                collegeId = colSnapsResult.data[0].id;
                profile.collegeId = collegeId;
                localStorage.setItem("lms_user", JSON.stringify(profile));
              }
            } catch (e) {
              console.error("Error resolving collegeId via adminEmail:", e);
            }
          }

          // 3. Resolve exact college document ID and subscribe to colleges/{targetColId}
          // OPTIMIZATION: Reduced full collection scan to targeted lookup
          if (collegeId && collegeId !== "global") {
            let targetColId = collegeId;
            try {
              // First try direct document access
              const directDocSnap = await getDoc(doc(db, "colleges", collegeId));
              if (directDocSnap.exists()) {
                targetColId = directDocSnap.id;
              } else {
                // Fallback: query with limit for slug matching
                const cleanSlug = (v?: string) => (v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "");
                const targetSlug = cleanSlug(collegeId);
                const allColsResult = await getDocuments<import("@/types").College>("colleges", [], false, { pageSize: 100 });
                const colDoc = allColsResult.data.find((c) => c.id === collegeId || cleanSlug(c.id) === targetSlug || cleanSlug(c.name) === targetSlug);
                if (colDoc) targetColId = colDoc.id;
              }
            } catch (e) {
              console.error("Error resolving college document for branding:", e);
            }

            const colRef = doc(db, "colleges", targetColId);
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
                localStorage.setItem("lms_college_branding", JSON.stringify({ collegeId: targetColId, branding: cBrand }));
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
