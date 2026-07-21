const fs = require('fs');

const files = [
  'src/app/(auth)/login/page.tsx',
  'src/app/(auth)/register/page.tsx',
  'src/app/college/login/page.tsx',
  'src/app/admin/login/page.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Add the import if it's not there
  if (!content.includes('useBranding')) {
    // Find the last import statement
    const importRegex = /import .* from ['"].*['"];?\r?\n/g;
    let lastImportIndex = 0;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastImportIndex = match.index + match[0].length;
    }
    content = content.slice(0, lastImportIndex) + `import { useBranding } from "@/providers/branding-provider";\n` + content.slice(lastImportIndex);
  }

  // Insert the hook into the main component.
  // The components are LoginContent, RegisterPage, CollegeLoginContent, AdminLoginContent
  const components = ['LoginContent', 'RegisterPage', 'CollegeLoginContent', 'AdminLoginContent'];
  for (const comp of components) {
    const fnRegex = new RegExp(`(function ${comp}\\s*\\([^)]*\\)\\s*\\{|export default function ${comp}\\s*\\([^)]*\\)\\s*\\{)`);
    if (fnRegex.test(content) && !content.includes('const { branding } = useBranding();')) {
      content = content.replace(fnRegex, `$1\n  const { branding } = useBranding();`);
    }
  }

  // Replace the APP_NAME and GraduationCap blocks
  const targetBlock = `<div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{APP_NAME}</span>`;
                
  const replacementBlock = `{branding.logoBase64 ? (
                  <img
                    src={branding.logoBase64}
                    alt="Company Logo"
                    className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-md shrink-0 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                    <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                )}
                <span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{branding.companyName || APP_NAME}</span>`;

  // For Admin login, it has {APP_NAME} Admin. For College login, it has {APP_NAME} Platform.
  // Let's do a more robust regex replacement.

  const regex = /<div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">\s*<GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" \/>\s*<\/div>\s*<span className="font-bold text-base sm:text-lg text-foreground tracking-tight">\{APP_NAME\}(.*?)<\/span>/g;
  
  content = content.replace(regex, (match, suffix) => {
    return `{branding.logoBase64 ? (
                  <img
                    src={branding.logoBase64}
                    alt="Company Logo"
                    className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-md shrink-0 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                    <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                )}
                <span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{branding.companyName || APP_NAME}${suffix}</span>`;
  });

  fs.writeFileSync(file, content, 'utf8');
}
console.log('Done replacing auth pages!');
