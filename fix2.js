const fs = require('fs');
const targetFile = 'src/app/(dashboard)/results/page.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

// Fix filteredAttempts
content = content.replace(/const rows = filteredAttempts\.map\(\(attempt: ExamAttempt\) => \{/g, 'const rows = paginatedAttempts.map((attempt: ExamAttempt) => {');

// Fix displayName on Student
content = content.replace(/s\.name \|\| s\.displayName \|\| s\.email/g, 's.name || (s as any).displayName || s.email');

// Fix attemptNames any[]
content = content.replace(/const attemptNames = \[\];/g, 'const attemptNames: string[] = [];');

// Fix title on { id: string }
content = content.replace(/examSubjectsList\.find\(\(e\) => e\.id === examFilter\)\?\.title/g, '((examSubjectsList as any[]).find((e) => e.id === examFilter))?.title');

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Fixed additional types');
