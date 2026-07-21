const fs = require('fs');
let file = 'src/app/(auth)/register/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">\s*<GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" \/>\s*<\/div>\s*<span className="font-bold text-base sm:text-lg text-foreground tracking-tight">\{APP_NAME\}<\/span>/g;

content = content.replace(regex, `{branding.logoBase64 ? (
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
                <span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{branding.companyName || APP_NAME}</span>`);

fs.writeFileSync(file, content, 'utf8');

let file2 = 'src/app/admin/login/page.tsx';
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace(/<span className="font-bold text-base sm:text-lg text-foreground tracking-tight">\{APP_NAME\} Admin<\/span>/g, `<span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{branding.companyName || APP_NAME} Admin</span>`);
// also replace logo in admin
const regexLogo = /<div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">\s*<GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" \/>\s*<\/div>/g;
content2 = content2.replace(regexLogo, `{branding.logoBase64 ? (
                  <img
                    src={branding.logoBase64}
                    alt="Company Logo"
                    className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-md shrink-0 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                    <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                )}`);
fs.writeFileSync(file2, content2, 'utf8');

let file3 = 'src/app/college/login/page.tsx';
let content3 = fs.readFileSync(file3, 'utf8');
content3 = content3.replace(/<span className="font-bold text-base sm:text-lg text-foreground tracking-tight">\{APP_NAME\} Platform<\/span>/g, `<span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{branding.companyName || APP_NAME} Platform</span>`);
content3 = content3.replace(regexLogo, `{branding.logoBase64 ? (
                  <img
                    src={branding.logoBase64}
                    alt="Company Logo"
                    className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-md shrink-0 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                    <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                )}`);
fs.writeFileSync(file3, content3, 'utf8');

console.log('Fixed missed instances');
