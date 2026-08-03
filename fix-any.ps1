$files = Get-ChildItem -Path "src" -Recurse -Include *.ts,*.tsx -File

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw

    $modified = $false
    
    # 1. Replace catch(err: any) with catch(err: unknown)
    if ($content -match "catch\s*\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*\)") {
        $content = [regex]::Replace($content, "catch\s*\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*\)", "catch (`$1: unknown)")
        $modified = $true
    }

    # 2. Replace (err as any).message with getErrorMessage(err)
    if ($content -match "\(\s*([a-zA-Z0-9_]+)\s*as\s*any\s*\)\.?message") {
        $content = [regex]::Replace($content, "\(\s*([a-zA-Z0-9_]+)\s*as\s*any\s*\)\.?message", "getErrorMessage(`$1)")
        $modified = $true
    }

    # 3. Add import for getErrorMessage if not present and we're dealing with errors
    if ($content -match "getErrorMessage" -and $content -notmatch "import.*getErrorMessage.*") {
        $importLine = "import { getErrorMessage } from '@/lib/utils/error';"
        # We append to the top after the first import or just at the very top
        $content = "$importLine`r`n" + $content
        $modified = $true
    }

    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "Updated $($file.FullName)"
    }
}
