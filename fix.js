const fs = require('fs');
const targetFile = 'src/app/(dashboard)/results/page.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

// Replace examSubjectsList
content = content.replace(/const examSubjectsList = useMemo\(\(\) => \{[\s\S]*?\}, \[filteredAttemptsByHierarchy, examTitleMap\]\);/, `const examSubjectsList = useMemo(() => {
    return uniqueOptions(
      (exams as Exam[]).map((e) => ({ id: e.id, title: e.title })),
      (e: { id: string }) => e.id
    );
  }, [exams]);`);

// Replace attemptNames
content = content.replace(/const attemptNames = filteredAttemptsByHierarchy[\s\S]*?\}, \[filteredAttemptsByHierarchy, students\]\);/, `const attemptNames = [];
    
    const studentNames = (students as Student[])
      .map((s: Student) => s.name || s.displayName || s.email)
      .filter((n): n is string => Boolean(n));

    return uniqueOptions([...attemptNames, ...studentNames], (n: string) => n.toLowerCase());
  }, [students]);`);

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Fixed broken variables');
