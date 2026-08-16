const fs = require('fs');
const files = [
  'src/app/(dashboard)/colleges/page.tsx',
  'src/app/(dashboard)/students/page.tsx'
];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/import\s*\{\s*createPortal\s*\}\s*from\s*['"]react-dom['"];?\r?\n?/g, '');
  
  // Replace: && typeof window !== "undefined" && createPortal( -> && (
  content = content.replace(/&&\s*typeof\s*window\s*!==\s*['"]undefined['"]\s*&&\s*createPortal\(/g, '&& (');
  
  // Replace: , document.body ) -> )
  content = content.replace(/,\s*document\.body\s*\)/g, ')');
  
  fs.writeFileSync(f, content);
  console.log('Fixed ' + f);
});
