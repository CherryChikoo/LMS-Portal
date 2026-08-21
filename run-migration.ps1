# PowerShell script to run the import_jobs table migration
# This creates the table needed for queue-based background imports

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Creating import_jobs Table" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Read the SQL file
$sqlFile = "prisma\migrations\add_import_jobs_table.sql"
$sql = Get-Content $sqlFile -Raw

Write-Host "SQL Migration:" -ForegroundColor Yellow
Write-Host $sql -ForegroundColor Gray
Write-Host ""

# Instructions for running
Write-Host "TO RUN THIS MIGRATION:" -ForegroundColor Green
Write-Host "1. Go to: https://rramkmudzrxaipukueuq.supabase.co" -ForegroundColor White
Write-Host "2. Click: SQL Editor (left sidebar)" -ForegroundColor White
Write-Host "3. Click: 'New Query' button" -ForegroundColor White
Write-Host "4. Copy the SQL above and paste it" -ForegroundColor White
Write-Host "5. Click: 'Run' button (or press Ctrl+Enter)" -ForegroundColor White
Write-Host "6. You should see: 'Success. No rows returned'" -ForegroundColor White
Write-Host ""
Write-Host "✅ Done! The table will be created." -ForegroundColor Green
Write-Host ""

# Also copy to clipboard if possible
try {
    $sql | Set-Clipboard
    Write-Host "📋 SQL copied to clipboard! Just paste it in Supabase SQL Editor." -ForegroundColor Cyan
} catch {
    Write-Host "Note: Could not copy to clipboard automatically." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
