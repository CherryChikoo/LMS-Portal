import { prisma } from "./src/lib/prisma";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
    console.log("Starting DB Cleanup...");
    try {
        const collegesDeleted = await prisma.colleges.deleteMany({
            where: { isDeleted: true }
        });
        console.log(`Deleted ${collegesDeleted.count} colleges (and cascaded their data).`);

        const examsDeleted = await prisma.exams.deleteMany({
            where: { deletedAt: { not: null } }
        });
        console.log(`Deleted ${examsDeleted.count} exams (and cascaded their questions/results).`);

        const usersDeleted = await prisma.users.deleteMany({
            where: { status: 'deleted' }
        });
        console.log(`Deleted ${usersDeleted.count} users (and cascaded their students/results).`);

        console.log("DB Cleanup completed successfully.");
    } catch (e) {
        console.error("Error during cleanup:", e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
