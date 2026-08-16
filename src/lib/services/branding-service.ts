import { supabase } from "@/lib/supabase/client";
import { getCompanyBrandingAction, getCompanyBrandingLightAction, updateCompanyBrandingAction } from "@/lib/actions/branding-actions";

export interface CompanyBranding {
  companyName: string;
  companySubtitle?: string;
  logoBase64?: string; // base64 encoded logo image
  updatedAt?: any;
}

const COLLECTION_NAME = "settings";
const DOC_ID = "branding";

export async function getCompanyBranding(): Promise<CompanyBranding> {
  try {
    const data = await getCompanyBrandingLightAction();
    if (data) {
      return {
        companyName: data.companyName || "",
        companySubtitle: data.companySubtitle || "",
        logoBase64: "", // Omitted to save bandwidth
      };
    }
  } catch (err) {
    console.error("Error fetching company branding:", err);
  }
  return {
    companyName: "",
    companySubtitle: "",
    logoBase64: "",
  };
}

export async function updateCompanyBranding(data: Partial<CompanyBranding>): Promise<void> {
  await updateCompanyBrandingAction(data);
}

export function subscribeToCompanyBranding(callback: (branding: CompanyBranding) => void): () => void {
  const channel = supabase.channel('branding-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: COLLECTION_NAME,
        filter: `id=eq.${DOC_ID}`
      },
      (payload) => {
        const data = payload.new as any;
        if (data) {
          callback({
            companyName: data.companyName || "",
            companySubtitle: data.companySubtitle || "",
            logoBase64: data.logoBase64 || "",
          });
        }
      }
    )
    .subscribe();

  // Initial fetch
  getCompanyBranding().then(callback);

  return () => {
    supabase.removeChannel(channel);
  };
}
