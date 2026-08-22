/**
 * Cleanup Script: Delete Recent Test Accounts
 * 
 * Usage: node scripts/cleanup-recent-users.mjs
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, "..", ".env.local") });

// Configuration
const MINUTES_AGO = 15; // Delete accounts created in last 15 minutes
const DRY_RUN = false; // Set to true to preview without deleting

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function deleteRecentUsers() {
  console.log(`\n🔍 Finding accounts created in the last ${MINUTES_AGO} minutes...\n`);

  try {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - MINUTES_AGO);
    const cutoffISO = cutoffTime.toISOString();

    console.log(`📅 Cutoff time: ${cutoffTime.toLocaleString()}`);
    console.log(`🔎 Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "DELETE MODE"}\n`);

    // Find recent students (join with users table for email)
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select(`
        id,
        createdAt,
        users!inner (
          email,
          displayName
        )
      `)
      .gte("createdAt", cutoffISO)
      .order("createdAt", { ascending: false });

    if (studentsError) {
      console.error("❌ Error fetching students:", studentsError);
      return;
    }

    console.log(`📊 Found ${students?.length || 0} student profile(s)\n`);

    if (students && students.length > 0) {
      console.log("Students to be deleted:");
      students.forEach((student, index) => {
        const user = student.users;
        console.log(
          `  ${index + 1}. ${user.displayName} (${user.email}) - Created: ${new Date(
            student.createdAt
          ).toLocaleString()}`
        );
      });
      console.log("");
    }

    // Find recent auth users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error("❌ Error fetching auth users:", authError);
      return;
    }

    const recentAuthUsers = authData.users.filter((user) => {
      const userCreatedAt = new Date(user.created_at);
      return userCreatedAt >= cutoffTime;
    });

    console.log(`📊 Found ${recentAuthUsers.length} auth user(s)\n`);

    if (recentAuthUsers.length > 0) {
      console.log("Auth users to be deleted:");
      recentAuthUsers.forEach((user, index) => {
        console.log(
          `  ${index + 1}. ${user.email} - Created: ${new Date(user.created_at).toLocaleString()}`
        );
      });
      console.log("");
    }

    if (DRY_RUN) {
      console.log("✅ DRY RUN complete. No changes made.");
      console.log("💡 Set DRY_RUN = false to actually delete these accounts.\n");
      return;
    }

    if (students?.length === 0 && recentAuthUsers.length === 0) {
      console.log("✅ No recent accounts found. Nothing to delete.\n");
      return;
    }

    console.log("⚠️  Deleting accounts NOW...\n");

    // Delete student profiles
    let studentsDeleted = 0;
    if (students && students.length > 0) {
      console.log("🗑️  Deleting student profiles...");

      for (const student of students) {
        const user = student.users;
        const { error: deleteError } = await supabase
          .from("students")
          .delete()
          .eq("id", student.id);

        if (deleteError) {
          console.error(`   ❌ Failed to delete ${user.email}:`, deleteError.message);
        } else {
          console.log(`   ✅ Deleted student: ${user.email}`);
          studentsDeleted++;
        }
      }
      console.log("");
    }

    // Delete auth users
    let authUsersDeleted = 0;
    if (recentAuthUsers.length > 0) {
      console.log("🗑️  Deleting auth users...");

      for (const user of recentAuthUsers) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

        if (deleteError) {
          console.error(`   ❌ Failed to delete ${user.email}:`, deleteError.message);
        } else {
          console.log(`   ✅ Deleted auth user: ${user.email}`);
          authUsersDeleted++;
        }
      }
      console.log("");
    }

    console.log("✅ Cleanup complete!\n");
    console.log(`📊 Summary:`);
    console.log(`   - Student profiles deleted: ${studentsDeleted}`);
    console.log(`   - Auth users deleted: ${authUsersDeleted}`);
    console.log("");
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

deleteRecentUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
