"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  const [masterBranding, setMasterBranding] = useState<CompanyBranding>(defaultBranding);
  const [collegeBranding, setCollegeBranding] = useState<CompanyBranding | null>(null);
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
            const collegeId = role === "student" ? profile.collegeId : profile.id;
            
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
                  return;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Error fetching college branding:", err);
      }
      setCollegeBranding(null);
    };

    fetchCollegeBranding();
    
    // Listen for storage changes in case of login/logout
    window.addEventListener("storage", fetchCollegeBranding);
    return () => window.removeEventListener("storage", fetchCollegeBranding);
  }, []);

  // College Branding takes precedence over Master Branding if it exists.
  const activeBranding = collegeBranding || masterBranding;

  return (
    <BrandingContext.Provider value={{ branding: activeBranding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
