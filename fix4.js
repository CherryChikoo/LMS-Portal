const fs = require('fs');
const targetFile = 'src/app/(dashboard)/results/page.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

content = content.replace(
  'if (student) return student.name || student.displayName || student.email || "Unknown Student";',
  'if (student) return student.name || (student as any).displayName || student.email || "Unknown Student";'
);

content = content.replace(
  'authId: (currentStudentUser as any)?.uid || currentStudentUser?.authId,',
  'authId: (currentStudentUser as any)?.uid || (currentStudentUser as any)?.authId,'
);

fs.writeFileSync(targetFile, content, 'utf8');
