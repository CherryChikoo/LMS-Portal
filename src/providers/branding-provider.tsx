"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CompanyBranding, subscribeToCompanyBranding } from "@/lib/services/branding-service";
import { getCollegeById } from "@/lib/services/college-service";

export interface BrandingContextType {
  branding: CompanyBranding;
  loading: boolean;
}

const defaultBranding: CompanyBranding = {
  companyName: "LMS Portal",
  companySubtitle: "Enterprise v2.4",
  logoBase64: "",
};

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  loading: true,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [masterBranding, setMasterBranding] = useState<CompanyBranding>(defaultBranding);
  const [collegeBranding, setCollegeBranding] = useState<CompanyBranding | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("lms_college_branding");
        const storedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (cached && storedUser) {
          const parsedCached = JSON.parse(cached);
          const profile = JSON.parse(storedUser);
          if (parsedCached.collegeId === profile.collegeId) {
            return parsedCached.branding;
          }
        }
      } catch (e) {}
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  // Subscribe to Master Branding
  useEffect(() => {
    const unsub = subscribeToCompanyBranding((data) => {
      setMasterBranding(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch College Branding based on Auth state
  useEffect(() => {
    const fetchCollegeBranding = async () => {
      try {
        const role = localStorage.getItem("lms_role");
        if (role === "student" || role === "college_admin") {
          const storedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
          if (storedUser) {
            const profile = JSON.parse(storedUser);
            // Both students and college_admins use profile.collegeId
            const collegeId = profile.collegeId;
            
            if (collegeId) {
              const college = await getCollegeById(collegeId);
              if (college && college.branding) {
                // Construct a CompanyBranding object from the college branding
                const cBrand = {
                  companyName: college.branding.companyName || college.name,
                  companySubtitle: college.branding.companySubtitle || "College Portal",
                  logoBase64: college.branding.logoBase64 || "",
                };
                
                // Only set if they actually overrode something
                if (college.branding.logoBase64 || college.branding.companyName) {
                  setCollegeBranding(cBrand);
                  localStorage.setItem("lms_college_branding", JSON.stringify({ collegeId, branding: cBrand }));
                  return;
                }
              }
            }
          }
        }
      } catch (err) {
      }
      setCollegeBranding(null);
      localStorage.removeItem("lms_college_branding");
    };

    fetchCollegeBranding();
    
    // Listen for storage changes in case of login/logout
    window.addEventListener("storage", fetchCollegeBranding);
    return () => window.removeEventListener("storage", fetchCollegeBranding);
  }, [pathname]);

  const isPublicRoute = !pathname || pathname === "/" || pathname === "/college/login" || pathname === "/admin/login" || pathname === "/register";

  // College Branding takes precedence over Master Branding if it exists, UNLESS it's a public route.
  const activeBranding = (isPublicRoute ? null : collegeBranding) || masterBranding;

  return (
    <BrandingContext.Provider value={{ branding: activeBranding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
