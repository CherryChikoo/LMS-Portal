import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";

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
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as CompanyBranding;
      return {
        companyName: data.companyName || "",
        companySubtitle: data.companySubtitle || "",
        logoBase64: data.logoBase64 || "",
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
  const docRef = doc(db, COLLECTION_NAME, DOC_ID);
  await setDoc(docRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export function subscribeToCompanyBranding(callback: (branding: CompanyBranding) => void): () => void {
  const docRef = doc(db, COLLECTION_NAME, DOC_ID);
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as CompanyBranding;
      callback({
        companyName: data.companyName || "",
        companySubtitle: data.companySubtitle || "",
        logoBase64: data.logoBase64 || "",
      });
    } else {
      callback({
        companyName: "",
        companySubtitle: "",
        logoBase64: "",
      });
    }
  }, (err) => {
    console.error("Error subscribing to company branding:", err);
    callback({
      companyName: "",
      companySubtitle: "",
      logoBase64: "",
    });
  });
}
