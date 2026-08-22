import { prisma } from '../src/lib/prisma';

async function main() {
  const seedExams = await prisma.exams.count({
    where: { id: { startsWith: 'seed-exam' } }
  });
  console.log('Seed exams:', seedExams);
  
  const results = await prisma.exam_results.count({
    where: { examId: { startsWith: 'seed-exam' } }
  });
  console.log('Results for seed exams:', results);

  // Hard delete them!
  const deleteResults = await prisma.exam_results.deleteMany({
    where: { examId: { startsWith: 'seed-exam' } }
  });
  console.log('Deleted results:', deleteResults.count);
  
  const deleteExams = await prisma.exams.deleteMany({
    where: { id: { startsWith: 'seed-exam' } }
  });
  console.log('Deleted exams:', deleteExams.count);
}

main().catch(console.error).finally(() => prisma.$disconnect());
