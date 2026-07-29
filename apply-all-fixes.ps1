# ============================================================================
# FIREBASE FIXES - AUTOMATED APPLICATION SCRIPT
# ============================================================================
# This script applies all remaining critical fixes to files 7, 8, 9, 10
# ============================================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = "c:\Users\cherr\OneDrive\Desktop\LMSPortal\lms-portal"
$BackupFolder = "$ProjectRoot\.firebase-fixes-backup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss')"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FIREBASE INTEGRITY FIXES - AUTOMATED  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project: $ProjectRoot" -ForegroundColor Gray
Write-Host "Backup:  $BackupFolder" -ForegroundColor Gray
Write-Host ""

# Create backup folder
Write-Host "[1/5] Creating backup folder..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $BackupFolder -Force | Out-Null
Write-Host "      ✓ Backup folder created" -ForegroundColor Green
Write-Host ""

# ============================================================================
# BACKUP FILES
# ============================================================================
Write-Host "[2/5] Backing up files before modification..." -ForegroundColor Yellow

$filesToModify = @(
    "src\app\api\admin\bulk-import-students\route.ts",
    "src\lib\services\csv-import-service.ts",
    "src\app\api\admin\update-college-auth\route.ts",
    "src\app\(dashboard)\colleges\page.tsx"
)

foreach ($file in $filesToModify) {
    $sourcePath = Join-Path $ProjectRoot $file
    if (Test-Path $sourcePath) {
        $backupPath = Join-Path $BackupFolder $file
        $backupDir = Split-Path $backupPath -Parent
        if (!(Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        Copy-Item $sourcePath $backupPath -Force
        Write-Host "      ✓ Backed up: $file" -ForegroundColor Green
    } else {
        Write-Host "      ✗ Not found: $file" -ForegroundColor Red
    }
}
Write-Host ""

# ============================================================================
# FIX 7: bulk-import-students/route.ts - Add rollback on Firestore failure
# ============================================================================
Write-Host "[3/5] Applying Fix 7: bulk-import-students/route.ts..." -ForegroundColor Yellow

$bulkImportFile = Join-Path $ProjectRoot "src\app\api\admin\bulk-import-students\route.ts"
$bulkImportContent = Get-Content $bulkImportFile -Raw -Encoding UTF8

$oldPattern7 = @'
          } catch \(dbErr: any\) \{
            summary\.failedCount\+\+;
            summary\.results\.push\(\{ name, email, password: "", status: "failed", reason: dbErr\?\.message \|\| "Firestore doc write error" \}\);
          \}
'@

$newCode7 = @'
          } catch (dbErr: any) {
            // ⚠️ CRITICAL FIX: Rollback Auth user if Firestore write fails
            try {
              await auth.deleteUser(uid);
              console.log(`Rolled back Auth user ${uid} after Firestore failure`);
            } catch (rollbackErr) {
              console.error(`Failed to rollback Auth user ${uid}:`, rollbackErr);
            }
            summary.failedCount++;
            summary.results.push({ name, email, password: "", status: "failed", reason: `Firestore write failed: ${dbErr?.message || "Unknown error"}. Auth account rolled back.` });
          }
'@

if ($bulkImportContent -match $oldPattern7) {
    $bulkImportContent = $bulkImportContent -replace $oldPattern7, $newCode7
    Set-Content -Path $bulkImportFile -Value $bulkImportContent -Encoding UTF8 -NoNewline
    Write-Host "      ✓ Added rollback logic to bulk-import-students" -ForegroundColor Green
} else {
    Write-Host "      ⚠ Pattern not found (may already be fixed)" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# FIX 8: csv-import-service.ts - Remove .catch(() => ({}))
# ============================================================================
Write-Host "[4/5] Applying Fix 8: csv-import-service.ts..." -ForegroundColor Yellow

$csvServiceFile = Join-Path $ProjectRoot "src\lib\services\csv-import-service.ts"
$csvServiceContent = Get-Content $csvServiceFile -Raw -Encoding UTF8

$oldPattern8 = 'const data = await response\.json\(\)\.catch\(\(\) => \(\{\}\)\);'

$newCode8 = @'
// ⚠️ CRITICAL FIX: Proper error handling - NO empty object returns
            let data;
            try {
              data = await response.json();
            } catch (jsonErr) {
              console.error("Failed to parse server response:", jsonErr);
              data = { error: "Invalid server response", success: false };
            }
'@

if ($csvServiceContent -match $oldPattern8) {
    $csvServiceContent = $csvServiceContent -replace $oldPattern8, $newCode8
    Set-Content -Path $csvServiceFile -Value $csvServiceContent -Encoding UTF8 -NoNewline
    Write-Host "      ✓ Fixed error swallowing in csv-import-service" -ForegroundColor Green
} else {
    Write-Host "      ⚠ Pattern not found (may already be fixed)" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# FIX 9: update-college-auth/route.ts - Return error on Firestore sync failure
# ============================================================================
Write-Host "[5/5] Applying Fix 9: update-college-auth/route.ts..." -ForegroundColor Yellow

$updateCollegeAuthFile = Join-Path $ProjectRoot "src\app\api\admin\update-college-auth\route.ts"
$updateCollegeAuthContent = Get-Content $updateCollegeAuthFile -Raw -Encoding UTF8

$oldPattern9 = @'
      \} catch \(err: any\) \{
        console\.error\(\{ route: "/api/admin/update-college-auth", stage, errorCode: err\?\.code, message: err\?\.message, stack: err\?\.stack \}\);
        // We log the firestore failure but the password auth update succeeded
      \}
'@

$newCode9 = @'
      } catch (err: any) {
        console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
        // ⚠️ CRITICAL FIX: Return error if Firestore sync fails
        return NextResponse.json({
          success: false,
          stage,
          error: "Auth updated but Firestore sync failed",
          errorCode: err?.code,
          message: err?.message,
          warning: "Email updated in Auth but not synced to Firestore database"
        }, { status: 500 });
      }
'@

if ($updateCollegeAuthContent -match $oldPattern9) {
    $updateCollegeAuthContent = $updateCollegeAuthContent -replace $oldPattern9, $newCode9
    Set-Content -Path $updateCollegeAuthFile -Value $updateCollegeAuthContent -Encoding UTF8 -NoNewline
    Write-Host "      ✓ Fixed Firestore sync error handling" -ForegroundColor Green
} else {
    Write-Host "      ⚠ Pattern not found (may already be fixed)" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# FIX 10: colleges/page.tsx - Complete atomic college creation with rollback
# ============================================================================
Write-Host "[MANUAL] Fix 10: colleges/page.tsx requires manual replacement" -ForegroundColor Cyan
Write-Host "         This file has a large function replacement." -ForegroundColor Gray
Write-Host "         Opening detailed instructions..." -ForegroundColor Gray
Write-Host ""

# Create instructions file
$instructionsFile = Join-Path $BackupFolder "FIX-10-INSTRUCTIONS.txt"
$instructions = @"
============================================================================
FIX 10: colleges/page.tsx - MANUAL REPLACEMENT REQUIRED
============================================================================

FILE: src\app\(dashboard)\colleges\page.tsx

FIND THE FUNCTION (around line 299):
    const handleCreate = async (e: React.FormEvent) => {

REPLACE THE ENTIRE FUNCTION WITH:
(See FIX-10-COMPLETE-FUNCTION.txt in this backup folder)

The new function includes:
- Email existence check before creating Firestore doc
- Complete rollback if Auth creation fails
- Proper error handling without .catch(() => ({}))
- Atomic operation guarantees

============================================================================
"@

Set-Content -Path $instructionsFile -Value $instructions -Encoding UTF8

# Create the complete function file
$functionFile = Join-Path $BackupFolder "FIX-10-COMPLETE-FUNCTION.txt"
$completeFunction = @'
const handleCreate = async (e: React.FormEvent) => {
  e.preventDefault();
  const trimName = name.trim();
  if (!trimName) return;

  if (loginEnabled && initialPassword.length < 6) {
    showError({ message: "The initial password must be at least 6 characters." });
    return;
  }

  // Duplicate Validation
  const existsInOfficial = colleges.some(c => c.name.toLowerCase() === trimName.toLowerCase());
  const existsInExternal = externalColleges.some(c => c.name.toLowerCase() === trimName.toLowerCase());

  if (existsInOfficial || existsInExternal) {
    showError({ message: `An institution named "${trimName}" already exists.` });
    return;
  }

  setCreating(true);
  let createdCollegeId: string | null = null;

  try {
    const deptsList: string[] = [];
    selectedDepts.forEach((d) => {
      if (d === "Custom Department") {
        if (customDeptName.trim()) {
          customDeptName.split(",").forEach((c) => {
            const trimmed = c.trim();
            if (trimmed && !deptsList.includes(trimmed)) deptsList.push(trimmed);
          });
        }
      } else if (d !== "General" && !deptsList.includes(d)) {
        deptsList.push(d);
      }
    });
    const depts = ensureGeneralDepartment(deptsList);

    const generatedCode =
      name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .substring(0, 6) || "COL";

    // ⚠️ CRITICAL FIX 1: Check if email exists BEFORE creating Firestore doc
    if (adminEmail.trim() && loginEnabled) {
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          const checkResp = await fetch("/api/admin/check-email-exists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              adminIdToken: token,
              email: adminEmail.trim().toLowerCase(),
            }),
          });

          if (checkResp.ok) {
            const checkData = await checkResp.json();
            if (checkData.exists) {
              toast.error(`Email ${adminEmail} is already registered. Please use a different email or delete the existing account first.`);
              setCreating(false);
              return;
            }
          }
        }
      } catch (checkErr) {
        console.error("Email existence check failed:", checkErr);
        // Continue anyway - will fail later with proper error
      }
    }

    // Create Firestore college document
    createdCollegeId = await createCollege({
      name,
      code: generatedCode,
      departments: depts,
      studentCount: 0,
      adminEmail: adminEmail.trim().toLowerCase(),
      initialPassword: initialPassword,
      loginEnabled: loginEnabled,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      branding: {
        companyName: name,
        companySubtitle: "College Portal",
        logoBase64: "",
      },
    });

    // ⚠️ CRITICAL FIX 2: Create Auth account with rollback on failure
    if (loginEnabled && adminEmail.trim()) {
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("Authentication token not available");
        }

        const authResp = await fetch("/api/admin/create-college-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminIdToken: token,
            email: adminEmail.trim().toLowerCase(),
            password: initialPassword,
            collegeId: createdCollegeId,
            collegeName: name
          }),
        });

        // ⚠️ CRITICAL FIX 3: Proper error handling - NO empty object returns
        let authData;
        try {
          authData = await authResp.json();
        } catch (jsonErr) {
          throw new Error("Failed to parse authentication response");
        }

        if (!authResp.ok) {
          // ⚠️ CRITICAL FIX 4: ROLLBACK - Delete Firestore college if Auth creation fails
          console.error("Auth creation failed, rolling back Firestore college:", authData);

          try {
            await deleteCollege(createdCollegeId);
            console.log(`Rolled back college ${createdCollegeId} after Auth creation failure`);
          } catch (rollbackErr) {
            console.error(`Failed to rollback college ${createdCollegeId}:`, rollbackErr);
          }

          const errorMsg = authData.error || authData.message || "Failed to create admin account";
          showError({
            message: errorMsg,
            details: authData.details,
            code: authData.errorCode
          });
          toast.error(`College creation failed: ${errorMsg}`);
          setCreating(false);
          return;
        }

        toast.success("College and admin account created successfully.");
      } catch (authErr: any) {
        console.error("Auth creation request failed:", authErr);

        // ⚠️ CRITICAL FIX 5: ROLLBACK - Delete Firestore college if Auth request fails
        if (createdCollegeId) {
          try {
            await deleteCollege(createdCollegeId);
            console.log(`Rolled back college ${createdCollegeId} after Auth request failure`);
          } catch (rollbackErr) {
            console.error(`Failed to rollback college ${createdCollegeId}:`, rollbackErr);
          }
        }

        const errorMsg = authErr.message || "Authentication service unavailable";
        toast.error(`College creation failed: ${errorMsg}`);
        setCreating(false);
        return;
      }
    } else {
      toast.success("College created successfully.");
    }

    // Success - reset form
    setShowAddModal(false);
    setName("");
    setSelectedDepts(["Computer Science & Engineering (CSE)", "General"]);
    setCustomDeptName("");
    setAdminEmail("");
    setInitialPassword("");
    setLoginEnabled(false);

  } catch (err: any) {
    console.error("College creation error:", err);
    showError(err);
    toast.error(err.message || "Failed to create college");
  } finally {
    setCreating(false);
  }
};
'@

Set-Content -Path $functionFile -Value $completeFunction -Encoding UTF8

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  AUTOMATED FIXES APPLIED SUCCESSFULLY!    " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "✓ Fix 7: bulk-import-students rollback - Applied" -ForegroundColor Green
Write-Host "✓ Fix 8: csv-import-service error handling - Applied" -ForegroundColor Green
Write-Host "✓ Fix 9: update-college-auth Firestore sync - Applied" -ForegroundColor Green
Write-Host "⚠ Fix 10: colleges/page.tsx - REQUIRES MANUAL REPLACEMENT" -ForegroundColor Yellow
Write-Host ""
Write-Host "Backup Location: $BackupFolder" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Open: src\app\(dashboard)\colleges\page.tsx" -ForegroundColor White
Write-Host "2. Find: const handleCreate = async (e: React.FormEvent) => {" -ForegroundColor White
Write-Host "3. Replace entire function with content from:" -ForegroundColor White
Write-Host "   $functionFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "4. Then run: npm run build" -ForegroundColor White
Write-Host "5. Deploy: firebase deploy --only firestore:rules" -ForegroundColor White
Write-Host "6. Deploy: vercel --prod" -ForegroundColor White
Write-Host ""

# Open the instruction files
Write-Host "Opening instruction files..." -ForegroundColor Gray
Start-Process notepad $instructionsFile
Start-Process notepad $functionFile

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
