const fs = require('fs');

// Fix progressive-lms-actions.ts
let file1 = 'src/lib/actions/progressive-lms-actions.ts';
let content1 = fs.readFileSync(file1, 'utf8');
content1 = content1.replace(
  'const [\n      collegeCount,\n      studentCount,\n      batchCount,\n      examCount,\n      resourceCount,\n      colleges,\n      batches,\n      exams,\n      resources,\n      recentStudents,\n    ] = await Promise.all([',
  `const [
      collegeCount,
      studentCount,
      batchCount,
      examCount,
      resourceCount,
      colleges,
      batches,
      exams,
      resources,
      recentStudents,
      attempts
    ] = await Promise.all([`
);
content1 = content1.replace(
  'prisma.resources.findMany({\n        orderBy: { createdAt: "desc" },\n      }),\n      \n      // Only first 100 students for initial render',
  `prisma.resources.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.exam_results.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          students: {
            select: { name: true, email: true, collegeName: true, collegeId: true }
          },
          exams: {
            select: { title: true }
          }
        }
      }),
      
      // Only first 100 students for initial render`
);
content1 = content1.replace(
  'attempts: [], // Will load separately if needed',
  'attempts: attempts.map(a => ({ ...a, studentName: a.students?.name, studentEmail: a.students?.email, collegeName: a.students?.collegeName, collegeId: a.students?.collegeId, examTitle: a.exams?.title })),'
);
fs.writeFileSync(file1, content1, 'utf8');

// Fix lms-sync-actions.ts
let file2 = 'src/lib/actions/lms-sync-actions.ts';
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace(
  'const [colleges, batches, students, exams, resources] = await Promise.all([',
  'const [colleges, batches, students, exams, resources, attempts] = await Promise.all(['
);
content2 = content2.replace(
  'prisma.resources.findMany(),\n      ]);',
  `prisma.resources.findMany(),
        prisma.exam_results.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            students: {
              select: { name: true, email: true, collegeName: true, collegeId: true }
            },
            exams: {
              select: { title: true }
            }
          }
        })
      ]);`
);
content2 = content2.replace(
  'attempts: [],',
  'attempts: attempts.map((a: any) => ({ ...a, studentName: a.students?.name, studentEmail: a.students?.email, collegeName: a.students?.collegeName, collegeId: a.students?.collegeId, examTitle: a.exams?.title })),'
);
fs.writeFileSync(file2, content2, 'utf8');

console.log("Restored attempts fetching");
