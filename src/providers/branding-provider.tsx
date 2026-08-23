"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { CompanyBranding, subscribeToCompanyBranding, getCompanyBranding } from "@/lib/services/branding-service";
import { getCurrentUser } from "@/lib/utils/auth-session";

import { fetchCollegeByIdAction } from "@/lib/actions/college-actions";

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
  const [masterBranding, setMasterBranding] = useState<CompanyBranding | null>(null);
  const [tenantBranding, setTenantBranding] = useState<CompanyBranding | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Determine role synchronously for render logic
  const [isCollegeRole, setIsCollegeRole] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRole = (localStorage.getItem("lms_role") || "").toLowerCase().trim();
      const storedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
      let activeRole = storedRole;
      if (!activeRole && storedUser) {
        try {
           activeRole = JSON.parse(storedUser).role?.toLowerCase().trim();
        } catch {}
      }
      if (activeRole === "college_admin" || activeRole === "college_student" || activeRole === "student") {
        setIsCollegeRole(true);
      }
    }
    // Load from localStorage on mount (client-side only) to avoid hydration mismatch
    try {
      const cachedMaster = localStorage.getItem("lms_branding");
      if (cachedMaster) {
        const parsed = JSON.parse(cachedMaster);
        if (parsed.companyName || parsed.logoBase64) {
          setMasterBranding(parsed);
        }
      }

      const storedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const role = (localStorage.getItem("lms_role") || "").toLowerCase().trim();
      let tenantAllowed = true;

      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        // CRITICAL: Prioritize lms_role (session role) over profile.role (database role)
        // College admins have lms_role="college_admin" but profile.role may be "trainer"/"admin"
        const pRole = (role || parsed.role || "").toLowerCase().trim();
        const enrollmentType = (parsed.enrollmentType || "").toLowerCase().trim();
        
        // College admins, college students, and normal students should ALWAYS see tenant branding
        const isCollegeTenant = pRole === "college_admin" || pRole === "college_student" || pRole === "student";
        
        if (
          !isCollegeTenant && (
            pRole === "admin" ||
            pRole === "master_admin" ||
            pRole === "main_admin" ||
            pRole === "superadmin" ||
            pRole === "super_admin" ||
            pRole === "trainer" ||
            enrollmentType === "self" ||
            parsed.isExternal ||
            !parsed.collegeId ||
            parsed.collegeId === "global"
          )
        ) {
          localStorage.removeItem("lms_college_branding");
          tenantAllowed = false;
        }
      }

      if (tenantAllowed) {
        const cachedCollege = localStorage.getItem("lms_college_branding");
        if (cachedCollege) {
          const parsed = JSON.parse(cachedCollege);
          if (parsed.branding) {
            setTenantBranding(parsed.branding);
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const initBranding = async () => {
      try {
        await getCurrentUser();
        
        const mBrand = await getCompanyBranding();
        if (!isCancelled && mBrand && (mBrand.companyName || mBrand.logoBase64)) {
          setMasterBranding(mBrand);
          try {
            localStorage.setItem("lms_branding", JSON.stringify(mBrand));
          } catch (_) {}
        }

        const storedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const userRole = (localStorage.getItem("lms_role") || "").toLowerCase().trim();

        if (storedUser) {
          const profile = JSON.parse(storedUser);
          const collegeId = profile.collegeId;
          // CRITICAL: Prioritize lms_role (session role) over profile.role (database role)
          const normalizedRole = (userRole || profile.role || "").toLowerCase().trim();
          const enrollmentType = (profile.enrollmentType || "").toLowerCase().trim();
          
          // College admins and college students should NEVER be classified as main admin
          const isCollegeTenant = normalizedRole === "college_admin" || normalizedRole === "college_student" || normalizedRole === "student";
          const isMainAdmin = !isCollegeTenant && (
                              normalizedRole === "admin" || 
                              normalizedRole === "master_admin" || 
                              normalizedRole === "main_admin" || 
                              normalizedRole === "superadmin" || 
                              normalizedRole === "super_admin" || 
                              normalizedRole === "trainer" ||
                              (!collegeId || collegeId === "global"));

          // Outside colleges and self-registered students must see the canonical Main Admin Portal Name
          const isOutsideOrSelf = enrollmentType === "self" || profile.isExternal;

          if (!isMainAdmin && !isOutsideOrSelf && collegeId && collegeId !== "global") {
            try {
              const data = await fetchCollegeByIdAction(collegeId);
              if (isCancelled) return;
              
              if (data && (data.type === "external" || (data as any).origin === "student" || (data as any).type === "outside")) {
                setTenantBranding(mBrand);
                localStorage.removeItem("lms_college_branding");
              } else if (data) {
                const officialColName = data.name?.trim() || profile.collegeName?.trim() || "College Portal";
                const cBrand: CompanyBranding = {
                  companyName: officialColName,
                  companySubtitle: (data.branding as any)?.companySubtitle?.trim() || `${officialColName} Portal`,
                  logoBase64: (data.branding as any)?.logoBase64 || "",
                };
                setTenantBranding(cBrand);
                localStorage.setItem("lms_college_branding", JSON.stringify({ collegeId: collegeId, branding: cBrand }));
              }
            } catch (err) {
              console.error("College branding fetch error:", err);
            }
          } else {
            // Main admin, self registered, or outside college: canonical Main Admin portal name
            setTenantBranding(mBrand);
            localStorage.removeItem("lms_college_branding");
          }
        } else {
          setTenantBranding(null);
          localStorage.removeItem("lms_college_branding");
        }

        if (!isCancelled) setLoading(false);
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
    window.addEventListener("lms_branding_updated", initBranding);

    return () => {
      isCancelled = true;
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("lms_branding_updated", initBranding);
    };
  }, []);

  // Strict isolation: College tenants should never see the main admin's branding.
  // If their branding is still loading, show empty instead of flashing "Masters Academy".
  const activeBranding = isCollegeRole 
    ? (tenantBranding || emptyBranding) 
    : (tenantBranding || masterBranding || emptyBranding);

  return (
    <BrandingContext.Provider value={{ branding: activeBranding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
