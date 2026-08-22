const fs = require('fs');

// progressive-lms-actions.ts
let file1 = 'src/lib/actions/progressive-lms-actions.ts';
let content1 = fs.readFileSync(file1, 'utf8');
content1 = content1.replace(
  'attempts: attempts.map(a => ({ ...a, studentName: a.students?.name, studentEmail: a.students?.email, collegeName: a.students?.collegeName, collegeId: a.students?.collegeId, examTitle: a.exams?.title })),',
  'attempts: [], // We no longer preload all 7,677+ attempts to save bandwidth'
);
fs.writeFileSync(file1, content1, 'utf8');

// lms-sync-actions.ts
let file2 = 'src/lib/actions/lms-sync-actions.ts';
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace(
  'attempts: attempts.map((a: any) => ({ ...a, studentName: a.students?.name, studentEmail: a.students?.email, collegeName: a.students?.collegeName, collegeId: a.students?.collegeId, examTitle: a.exams?.title })),',
  'attempts: [],'
);
fs.writeFileSync(file2, content2, 'utf8');

console.log("Restored attempts: [] to backend actions");
