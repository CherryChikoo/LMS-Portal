const fs = require('fs');
const targetFile = 'src/app/(dashboard)/results/page.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

// Fix authId on Student
content = content.replace(
  'authId: (currentStudentUser as any)?.uid || currentStudentUser?.authId,',
  'authId: (currentStudentUser as any)?.uid || (currentStudentUser as any)?.authId,'
);

// Fix displayName on Student
content = content.replace(
  's.name || (s as any).displayName || s.email',
  's.name || (s as any).displayName || s.email'
); // wait, where is line 267?

fs.writeFileSync(targetFile, content, 'utf8');
