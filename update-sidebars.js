const fs = require('fs');

let file = 'src/components/layout/sidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

// add import
if (!content.includes('useBranding')) {
  content = content.replace(/import \{ subscribeToCompanyBranding, updateCompanyBranding, CompanyBranding \} from "@\/lib\/services\/branding-service";/, `import { updateCompanyBranding } from "@/lib/services/branding-service";\nimport { useBranding } from "@/providers/branding-provider";`);
  content = content.replace(/import \{ subscribeToCompanyBranding, updateCompanyBranding \} from "@\/lib\/services\/branding-service";/, `import { updateCompanyBranding } from "@/lib/services/branding-service";\nimport { useBranding } from "@/providers/branding-provider";`);
}

// remove local state and useEffect for branding
content = content.replace(/const \[branding, setBranding\] = useState(?:<CompanyBranding>)?\(\{\s*companyName: APP_NAME,\s*companySubtitle: "Enterprise v2.4",\s*\}\);/, `const { branding } = useBranding();`);

const useEffectRegex = /useEffect\(\(\) => \{\s*const unsub = subscribeToCompanyBranding\(\(data\) => \{\s*setBranding\(data\);\s*\}\);\s*return \(\) => unsub\(\);\s*\}, \[\]\);/g;
content = content.replace(useEffectRegex, '');

fs.writeFileSync(file, content, 'utf8');


let file2 = 'src/components/layout/mobile-sidebar.tsx';
let content2 = fs.readFileSync(file2, 'utf8');

if (!content2.includes('useBranding')) {
  content2 = content2.replace(/import \{ subscribeToCompanyBranding \} from "@\/lib\/services\/branding-service";/, `import { useBranding } from "@/providers/branding-provider";`);
}

content2 = content2.replace(/const \[branding, setBranding\] = useState\(\{\s*companyName: APP_NAME,\s*companySubtitle: "Enterprise v2.4",\s*\}\);/, `const { branding } = useBranding();`);

const useEffectRegex2 = /useEffect\(\(\) => \{\s*const unsub = subscribeToCompanyBranding\(\(data\) => \{\s*setBranding\(data\);\s*\}\);\s*return \(\) => unsub\(\);\s*\}, \[\]\);/g;
content2 = content2.replace(useEffectRegex2, '');

fs.writeFileSync(file2, content2, 'utf8');

console.log('Fixed sidebars');
