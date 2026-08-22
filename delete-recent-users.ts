import { prisma } from './src/lib/prisma';
import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const cutoffTime = new Date(Date.now() - 30 * 60 * 1000); // Look back 30 mins just to be safe
  
  console.log(`Finding students created after: ${cutoffTime.toISOString()}`);
  
  const recentUsers = await prisma.users.findMany({
    where: {
      createdAt: {
        gte: cutoffTime
      },
      role: 'student'
    },
    select: {
      id: true,
      authId: true,
      email: true,
      createdAt: true
    }
  });

  console.log(`Found ${recentUsers.length} users created in the last 30 minutes.`);

  if (recentUsers.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const dbUserIds = recentUsers.map(u => u.id);
  const authIds = recentUsers.map(u => u.authId).filter(Boolean) as string[];

  console.log(`Will delete ${dbUserIds.length} DB records and ${authIds.length} Auth accounts.`);

  // 1. Delete student_batches first to satisfy FK constraints
  console.log("Cleaning up student_batches...");
  await prisma.student_batches.deleteMany({
    where: { studentId: { in: dbUserIds } }
  });

  // 2. Delete students
  console.log("Cleaning up students...");
  await prisma.students.deleteMany({
    where: { id: { in: dbUserIds } }
  });

  // 3. Delete users
  console.log("Cleaning up users...");
  const deletedUsers = await prisma.users.deleteMany({
    where: { id: { in: dbUserIds } }
  });
  console.log(`Deleted ${deletedUsers.count} users from DB.`);

  // 4. Delete Supabase Auth
  console.log("Cleaning up Supabase Auth...");
  let deletedAuthCount = 0;
  
  // Delete in small batches to avoid rate limits
  for (let i = 0; i < authIds.length; i += 10) {
    const chunk = authIds.slice(i, i + 10);
    const promises = chunk.map(id => supabaseAdmin.auth.admin.deleteUser(id));
    const results = await Promise.allSettled(promises);
    
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled' && !res.value.error) {
        deletedAuthCount++;
      } else if (res.status === 'fulfilled' && res.value.error) {
        console.error(`Auth delete error for ${chunk[idx]}:`, res.value.error.message);
      } else if (res.status === 'rejected') {
        console.error(`Auth delete rejected for ${chunk[idx]}:`, res.reason);
      }
    });
    
    // Small delay between chunks
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Deleted ${deletedAuthCount} accounts from Supabase Auth.`);
  console.log("Cleanup complete!");
}

main()
  .catch(e => {
    console.error("Fatal error during cleanup:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
