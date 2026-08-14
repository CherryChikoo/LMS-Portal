$hashConfig = '{"algorithm":"SCRYPT","base64_signer_key":"4QL4o52VE5vS9WtUSIDXB9p8IuCmY04/V7VLoL8RmP4H95JIPRTp+gCPCsX2n8ycYRKgIsPnOIKzi3HfiuC3KA==","base64_salt_separator":"Bw==","rounds":8,"mem_cost":14}'
Write-Host "Please authenticate with your Supabase account (it will open a browser)..."
npx supabase login

Write-Host "Starting bulk import of 953 users into Supabase..."
npx supabase auth import firebase firebase_users.json --project-ref rramkmudzrxaipukueuq --password-hash-parameter $hashConfig

Write-Host "Migration complete!"
