const fs = require('fs');
let file = 'src/app/(dashboard)/settings/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add getCollegeById, updateCollege to imports
if (!content.includes('getCollegeById')) {
  content = content.replace(/import \{ subscribeToCompanyBranding, updateCompanyBranding, type CompanyBranding \} from "@\/lib\/services\/branding-service";/, `import { subscribeToCompanyBranding, updateCompanyBranding, type CompanyBranding } from "@/lib/services/branding-service";\nimport { getCollegeById, updateCollege } from "@/lib/services/college-service";`);
}

// 2. Modify handleSaveBranding to handle college_admin
// Let's replace handleSaveBranding function
const handleSaveBrandingRegex = /const handleSaveBranding = async \(\) => \{[\s\S]*?finally \{\s*setSavingBrand\(false\);\s*\}\s*\};/;
const newHandleSaveBranding = `const handleSaveBranding = async () => {
    setSavingBrand(true);
    setBrandSaved(false);
    try {
      if (userRole === "college_admin") {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const u = uStr ? JSON.parse(uStr) : null;
        if (u && u.id) {
          await updateCollege(u.id, {
            branding: {
              companyName: brandName.trim(),
              companySubtitle: brandSubtitle.trim(),
              logoBase64: brandLogo,
            }
          });
        }
      } else {
        await updateCompanyBranding({
          companyName: brandName.trim() || "LMS Portal",
          companySubtitle: brandSubtitle.trim() || "Enterprise v2.4",
          logoBase64: brandLogo,
        });
      }
      setBrandSaved(true);
      setTimeout(() => setBrandSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save branding:", err);
    } finally {
      setSavingBrand(false);
    }
  };`;

content = content.replace(handleSaveBrandingRegex, newHandleSaveBranding);

// 3. We also need to load the College branding if user is college_admin
const useEffectBrandingRegex = /useEffect\(\(\) => \{\s*const unsub = subscribeToCompanyBranding\(\(data\) => \{[\s\S]*?return \(\) => unsub\(\);\s*\}, \[\]\);/;
const newUseEffectBranding = `useEffect(() => {
    let unsub = () => {};
    const initBranding = async () => {
      let role = "admin";
      try {
        role = (localStorage.getItem("lms_role") || "admin").toLowerCase();
      } catch {}
      
      if (role === "college_admin") {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const u = uStr ? JSON.parse(uStr) : null;
        if (u && u.id) {
          const college = await getCollegeById(u.id);
          if (college && college.branding) {
            setBranding({
              companyName: college.branding.companyName || college.name,
              companySubtitle: college.branding.companySubtitle || "College Portal",
              logoBase64: college.branding.logoBase64 || "",
            });
            setBrandName(college.branding.companyName || college.name);
            setBrandSubtitle(college.branding.companySubtitle || "College Portal");
            setBrandLogo(college.branding.logoBase64 || "");
          }
        }
      } else {
        unsub = subscribeToCompanyBranding((data) => {
          setBranding(data);
          setBrandName(data.companyName || "LMS Portal");
          setBrandSubtitle(data.companySubtitle || "Enterprise v2.4");
          setBrandLogo(data.logoBase64 || "");
        });
      }
    };
    initBranding();
    return () => unsub();
  }, []);`;

content = content.replace(useEffectBrandingRegex, newUseEffectBranding);

// 4. Update the texts in the UI to dynamically show "College Branding" or "Global Company Branding"
content = content.replace(/<h3 className="text-base font-bold text-foreground">Global Company Branding<\/h3>/, `<h3 className="text-base font-bold text-foreground">{userRole === "college_admin" ? "College Branding" : "Global Company Branding"}</h3>`);
content = content.replace(/<p className="text-xs text-muted-foreground">Configure the portal logo and company name displayed across all admin and student interfaces\.<\/p>/, `<p className="text-xs text-muted-foreground">{userRole === "college_admin" ? "Configure your college logo and name displayed to your students and admins." : "Configure the portal logo and company name displayed across all admin and student interfaces."}</p>`);

content = content.replace(/<span>Global branding updated successfully!<\/span>/, `<span>{userRole === "college_admin" ? "College branding" : "Global branding"} updated successfully!</span>`);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed settings page for college admin branding');
