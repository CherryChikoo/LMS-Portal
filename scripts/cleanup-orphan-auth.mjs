/**
 * Cleanup Script: Delete Orphan Auth Accounts
 * 
 * Deletes auth accounts that don't have corresponding users/students records
 * 
 * Usage: node scripts/cleanup-orphan-auth.mjs
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
const MINUTES_AGO = 15; // Only check accounts created in last 15 minutes
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

async function deleteOrphanAuthAccounts() {
  console.log(`\n🔍 Finding orphan auth accounts (created in last ${MINUTES_AGO} minutes)...\n`);

  try {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - MINUTES_AGO);

    console.log(`📅 Cutoff time: ${cutoffTime.toLocaleString()}`);
    console.log(`🔎 Mode: ${DRY_RUN ? "DRY RUN (preview only)" : "DELETE MODE"}\n`);

    // 1. Get all auth users created in the last X minutes
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error("❌ Error fetching auth users:", authError);
      return;
    }

    const recentAuthUsers = authData.users.filter((user) => {
      const userCreatedAt = new Date(user.created_at);
      return userCreatedAt >= cutoffTime;
    });

    console.log(`📊 Found ${recentAuthUsers.length} auth user(s) created recently\n`);

    if (recentAuthUsers.length === 0) {
      console.log("✅ No recent auth accounts found.\n");
      return;
    }

    // 2. Get all users from the users table
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("authId");

    if (usersError) {
      console.error("❌ Error fetching users table:", usersError);
      return;
    }

    const userAuthIds = new Set(users?.map(u => u.authId).filter(Boolean) || []);
    console.log(`📊 Found ${userAuthIds.size} users in database with authId\n`);

    // 3. Find orphan auth accounts
    const orphanAuthAccounts = recentAuthUsers.filter(authUser => {
      return !userAuthIds.has(authUser.id);
    });

    console.log(`🔍 Found ${orphanAuthAccounts.length} orphan auth account(s)\n`);

    if (orphanAuthAccounts.length === 0) {
      console.log("✅ No orphan auth accounts found. All accounts have corresponding user records.\n");
      return;
    }

    console.log("Orphan auth accounts to be deleted:");
    orphanAuthAccounts.forEach((user, index) => {
      console.log(
        `  ${index + 1}. ${user.email} - Created: ${new Date(user.created_at).toLocaleString()}`
      );
    });
    console.log("");

    // Exit if dry run
    if (DRY_RUN) {
      console.log("✅ DRY RUN complete. No changes made.");
      console.log("💡 Set DRY_RUN = false to actually delete these accounts.\n");
      return;
    }

    console.log("⚠️  WARNING: You are about to permanently delete these orphan auth accounts!");
    console.log("⏳ Starting deletion in 3 seconds... (Press Ctrl+C to cancel)\n");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 4. Delete orphan auth accounts
    console.log("🗑️  Deleting orphan auth accounts...");

    let deleted = 0;
    let failed = 0;

    for (const user of orphanAuthAccounts) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

      if (deleteError) {
        console.error(`   ❌ Failed to delete ${user.email}:`, deleteError.message);
        failed++;
      } else {
        console.log(`   ✅ Deleted orphan auth: ${user.email}`);
        deleted++;
      }
    }
    console.log("");

    console.log("✅ Cleanup complete!\n");
    console.log(`📊 Summary:`);
    console.log(`   - Total orphan auth accounts found: ${orphanAuthAccounts.length}`);
    console.log(`   - Successfully deleted: ${deleted}`);
    console.log(`   - Failed: ${failed}`);
    console.log("");
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

// Run the cleanup
deleteOrphanAuthAccounts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
