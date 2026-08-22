import { createClient } from '@supabase/supabase-js';
import { prisma } from './src/lib/prisma';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findAndDeleteOrphans() {
  console.log("Fetching DB records...");
  
  // 1. Get all students and users from Prisma
  const users = await prisma.users.findMany({ select: { authId: true, email: true } });
  const students = await prisma.students.findMany({ select: { authId: true } });
  
  const dbUserIds = new Set([
    ...users.filter(u => u.authId).map(u => u.authId as string),
    ...students.filter(s => s.authId).map(s => s.authId as string)
  ]);
  
  console.log(`Found ${users.length} users and ${students.length} students in PostgreSQL.`);
  console.log(`Total unique IDs in Postgres: ${dbUserIds.size}`);
  
  // 2. Get all auth accounts from Supabase Auth
  console.log("\nFetching Auth accounts from Supabase...");
  let allAuthUsers: any[] = [];
  let page = 1;
  
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: page,
      perPage: 1000
    });
    
    if (error) {
      console.error("Error fetching auth users:", error);
      break;
    }
    
    if (!data.users || data.users.length === 0) {
      break;
    }
    
    allAuthUsers.push(...data.users);
    page++;
  }
  
  console.log(`Found ${allAuthUsers.length} total Auth accounts in Supabase.`);
  
  // 3. Find orphans
  const orphans = allAuthUsers.filter(u => !dbUserIds.has(u.id));
  console.log(`\nFound ${orphans.length} orphan Auth accounts that do NOT exist in Postgres!`);
  
  // 4. Delete orphans
  if (orphans.length > 0) {
    console.log("Deleting orphans...");
    let deleted = 0;
    
    // Process sequentially to avoid rate limits
    for (const orphan of orphans) {
      console.log(`Deleting orphan: ${orphan.email} (ID: ${orphan.id})`);
      const { error } = await supabase.auth.admin.deleteUser(orphan.id);
      
      if (error) {
        console.error(`Failed to delete ${orphan.email}:`, error);
      } else {
        deleted++;
      }
      
      // Small delay to be gentle on the API
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(`\nSuccessfully deleted ${deleted}/${orphans.length} orphan accounts.`);
  } else {
    console.log("\nNo orphans to delete. Everything is in sync!");
  }
}

findAndDeleteOrphans()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
