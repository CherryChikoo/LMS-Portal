const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const exam = await prisma.exams.findUnique({ where: { id: "seed-exam-016" } });
  console.log("EXAM:", exam);
  
  // also check if there are any soft-deleted exams
  const softDeleted = await prisma.exams.count({ where: { isDeleted: true } });
  console.log("SOFT DELETED EXAMS:", softDeleted);
  
  // what about exam_results? Are there exam_results where the exam is deleted?
  const orphanedResults = await prisma.exam_results.count({
    where: {
      exams: {
         isDeleted: true
      }
    }
  });
  console.log("ORPHANED RESULTS (exam isDeleted):", orphanedResults);
}
main().catch(console.error).finally(() => prisma.$disconnect());
