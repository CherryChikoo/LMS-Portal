# Add These Environment Variables to Vercel

Go to: https://vercel.com/cherrychikooh-6502s-projects/lms-portal-optimized/settings/environment-variables

## Add the following variables for ALL environments (Production, Preview, Development):

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://rramkmudzrxaipukueuq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYW1rbXVkenJ4YWlwdWt1ZXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NTM1NDYsImV4cCI6MjEwMjEyOTU0Nn0.g_WfGKb8z4wtP-ZQA56KjvbvDdgavJzUrYtuzaMyg5E
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYW1rbXVkenJ4YWlwdWt1ZXVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjU1MzU0NiwiZXhwIjoyMTAyMTI5NTQ2fQ.CaUyYaeqNI_xlsJ1ep_cn9vJr07MzXCxL0iCSP68gzE

# Database Configuration
DATABASE_URL=postgresql://postgres.rramkmudzrxaipukueuq:LMSPortal%40admin@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.rramkmudzrxaipukueuq:LMSPortal%40admin@aws-0-ap-south-1.pooler.supabase.com:5432/postgres

# Optional
GEMINI_API_KEY=AI6zaSyCQzAb8RN6IHD6JhlMT3i6ZkINvSqy7cpcVz5tR-Cg0_UvFXE8xZFQ
DEFAULT_STUDENT_PASSWORD=Welcome@123
```

## You can also delete old Firebase variables (no longer needed):
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
- FIREBASE_ADMIN_PROJECT_ID
- FIREBASE_ADMIN_CLIENT_EMAIL
- FIREBASE_ADMIN_PRIVATE_KEY

After adding these, redeploy from Vercel dashboard or run:
```bash
vercel --prod
```
