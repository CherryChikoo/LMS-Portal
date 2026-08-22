const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Starting DB Cleanup...");

    try {
        // 1. Delete Colleges where isDeleted = true
        const collegesDeleted = await prisma.colleges.deleteMany({
            where: { isDeleted: true }
        });
        console.log(`Deleted ${collegesDeleted.count} colleges (and cascaded their data).`);

        // 2. Delete Exams where deletedAt != null
        const examsDeleted = await prisma.exams.deleteMany({
            where: { deletedAt: { not: null } }
        });
        console.log(`Deleted ${examsDeleted.count} exams (and cascaded their questions/results).`);

        // 3. Delete Users where status = 'deleted'
        const usersDeleted = await prisma.users.deleteMany({
            where: { status: 'deleted' }
        });
        console.log(`Deleted ${usersDeleted.count} users (and cascaded their students/results).`);

        console.log("DB Cleanup completed successfully.");
    } catch (e) {
        console.error("Error during cleanup:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
