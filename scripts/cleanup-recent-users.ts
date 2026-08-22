/**
 * Cleanup Script: Delete Recent Test Accounts
 * 
 * This script deletes user accounts and student profiles created in the last X minutes.
 * Useful for cleaning up test imports.
 * 
 * Usage: npx tsx scripts/cleanup-recent-users.ts
 */

import { createClient } from "@supabase/supabase-js";

// Configuration
const MINUTES_AGO = 10; // Delete accounts created in last 10 minutes
const DRY_RUN = false; // Set to true to preview without deleting

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    // Calculate cutoff time
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - MINUTES_AGO);
    const cutoffISO = cutoffTime.toISOString();

    console.log(`📅 Cutoff time: ${cutoffTime.toLocaleString()}`);
    console.log(`🔎 Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "DELETE MODE"}\n`);

    // 1. Find recent students in students table
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, email, name, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false });

    if (studentsError) {
      console.error("❌ Error fetching students:", studentsError);
      return;
    }

    console.log(`📊 Found ${students?.length || 0} student profile(s)\n`);

    if (students && students.length > 0) {
      console.log("Students to be deleted:");
      students.forEach((student, index) => {
        console.log(
          `  ${index + 1}. ${student.name} (${student.email}) - Created: ${new Date(
            student.created_at
          ).toLocaleString()}`
        );
      });
      console.log("");
    }

    // 2. Find recent auth users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error("❌ Error fetching auth users:", authError);
      return;
    }

    // Filter auth users by created_at
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

    // Exit if dry run
    if (DRY_RUN) {
      console.log("✅ DRY RUN complete. No changes made.");
      console.log("💡 Set DRY_RUN = false to actually delete these accounts.\n");
      return;
    }

    // Confirm deletion
    if (students?.length === 0 && recentAuthUsers.length === 0) {
      console.log("✅ No recent accounts found. Nothing to delete.\n");
      return;
    }

    console.log("⚠️  WARNING: You are about to permanently delete these accounts!");
    console.log("⏳ Starting deletion in 3 seconds... (Press Ctrl+C to cancel)\n");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 3. Delete student profiles
    if (students && students.length > 0) {
      console.log("🗑️  Deleting student profiles...");

      for (const student of students) {
        const { error: deleteError } = await supabase
          .from("students")
          .delete()
          .eq("id", student.id);

        if (deleteError) {
          console.error(`   ❌ Failed to delete ${student.email}:`, deleteError.message);
        } else {
          console.log(`   ✅ Deleted student: ${student.email}`);
        }
      }
      console.log("");
    }

    // 4. Delete auth users
    if (recentAuthUsers.length > 0) {
      console.log("🗑️  Deleting auth users...");

      for (const user of recentAuthUsers) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

        if (deleteError) {
          console.error(`   ❌ Failed to delete ${user.email}:`, deleteError.message);
        } else {
          console.log(`   ✅ Deleted auth user: ${user.email}`);
        }
      }
      console.log("");
    }

    console.log("✅ Cleanup complete!\n");
    console.log(`📊 Summary:`);
    console.log(`   - Student profiles deleted: ${students?.length || 0}`);
    console.log(`   - Auth users deleted: ${recentAuthUsers.length}`);
    console.log("");
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

// Run the cleanup
deleteRecentUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
