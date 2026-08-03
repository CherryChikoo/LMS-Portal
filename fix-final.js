const fs = require('fs');

function replaceFile(path, regex, replacement) {
  let c = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(path, c.replace(regex, replacement));
}

replaceFile('src/app/api/ai-summary/route.ts', /result\.answers/g, '(result.answers || {})');
replaceFile('src/app/exams/[id]/take/page.tsx', /exam\.duration/g, '(exam.duration || 0)');
replaceFile('src/lib/hierarchy/hierarchy-data.ts', /Array\.from\(inst\.departments\)/g, 'Array.from(inst.departments).filter(Boolean) as string[]');
