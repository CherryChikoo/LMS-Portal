# Add Supabase Environment Variables to Vercel
# Run this from the lms-portal directory

Write-Host "Adding Supabase environment variables to Vercel..." -ForegroundColor Green

# Add NEXT_PUBLIC_SUPABASE_URL
echo "https://rramkmudzrxaipukueuq.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production preview development

# Add NEXT_PUBLIC_SUPABASE_ANON_KEY
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYW1rbXVkenJ4YWlwdWt1ZXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NTM1NDYsImV4cCI6MjEwMjEyOTU0Nn0.g_WfGKb8z4wtP-ZQA56KjvbvDdgavJzUrYtuzaMyg5E" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production preview development

# Add SUPABASE_SERVICE_ROLE_KEY
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYW1rbXVkenJ4YWlwdWt1ZXVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjU1MzU0NiwiZXhwIjoyMTAyMTI5NTQ2fQ.CaUyYaeqNI_xlsJ1ep_cn9vJr07MzXCxL0iCSP68gzE" | vercel env add SUPABASE_SERVICE_ROLE_KEY production preview development

# Add DATABASE_URL
echo "postgresql://postgres.rramkmudzrxaipukueuq:LMSPortal%40admin@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true" | vercel env add DATABASE_URL production preview development

# Add DIRECT_URL
echo "postgresql://postgres.rramkmudzrxaipukueuq:LMSPortal%40admin@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" | vercel env add DIRECT_URL production preview development

Write-Host "`nEnvironment variables added successfully!" -ForegroundColor Green
Write-Host "Now deploy with: vercel --prod" -ForegroundColor Cyan
