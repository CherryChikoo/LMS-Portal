# ⚠️ CRITICAL: Vercel Environment Variables Setup Required

## Current Status
✅ Exam Share Link system fully implemented  
✅ Local build successful (88 routes)  
⚠️ **Missing Vercel environment variables**

## 🎯 Action Required

You need to add the following environment variable to your Vercel project **before deploying**:

### Go to Vercel Dashboard
https://vercel.com/cherrychikooh-6502s-projects/lms-portal-optimized/settings/environment-variables

### Add This Variable

**Variable Name:** `NEXT_PUBLIC_APP_URL`

**Value:** Get your Vercel deployment URL from:
- Option 1: Check your latest deployment URL at https://vercel.com/cherrychikooh-6502s-projects/lms-portal-optimized
- Option 2: It's usually something like: `https://lms-portal-optimized.vercel.app`
- Option 3: Or your custom domain if configured

**Environments:** Select **Production, Preview, Development** (all three)

**Example values:**
- Production: `https://lms-portal-optimized.vercel.app`
- Or custom domain: `https://yourdomain.com`

## ✅ Existing Variables (Already Configured)

These are already set and working:
- ✅ NEXT_PUBLIC_SUPABASE_URL
- ✅ GEMINI_API_KEY
- ✅ Firebase variables (old system, can be removed if not used)

## 📋 Steps to Complete Setup

### Step 1: Add NEXT_PUBLIC_APP_URL

1. Go to: https://vercel.com/cherrychikooh-6502s-projects/lms-portal-optimized/settings/environment-variables

2. Click **"Add New"**

3. Enter:
   - Name: `NEXT_PUBLIC_APP_URL`
   - Value: Your Vercel URL (e.g., `https://lms-portal-optimized.vercel.app`)
   - Environments: Select all three (Production, Preview, Development)

4. Click **"Save"**

### Step 2: Verify Other Required Variables

Make sure these are also set (they should already exist from previous setup):

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅ (already set 42m ago)
- `SUPABASE_SERVICE_ROLE_KEY` (check if exists)
- `DATABASE_URL` (check if exists)
- `DIRECT_URL` (check if exists)
- `GEMINI_API_KEY` ✅ (already set)

If any are missing, add them using the values from `.env.production.example`.

### Step 3: Update Supabase Redirect URLs

Go to: https://supabase.com/dashboard/project/rramkmudzrxaipukueuq/auth/url-configuration

Add these to **Redirect URLs**:
```
https://your-vercel-domain.vercel.app/auth/callback
https://*.vercel.app/auth/callback
```

Add to **Site URL**:
```
https://your-vercel-domain.vercel.app
```

### Step 4: Deploy to Vercel

Once environment variables are configured:

**Option A: Auto-deploy via Git**
```bash
cd lms-portal
git add .
git commit -m "Add exam share link system"
git push
```
Vercel will auto-deploy if connected to your repo.

**Option B: Manual deploy via CLI**
```bash
cd lms-portal
vercel --prod
```

### Step 5: Verify Deployment

After deployment completes:

1. Visit your Vercel URL
2. Login as admin
3. Go to Exams page
4. Create a test exam
5. Click "Copy Link" button
6. Open link in incognito window
7. Should redirect to login
8. Login as student
9. Should return to exam automatically

## 🐛 If Deployment Fails

Check Vercel deployment logs for specific errors:
https://vercel.com/cherrychikooh-6502s-projects/lms-portal-optimized/deployments

Common issues:
- Missing environment variables → Add them via dashboard
- Build errors → Check error message and fix code
- Prisma errors → Ensure DATABASE_URL is correct
- Runtime errors → Check server logs in deployment

## 📊 Environment Variables Checklist

Copy this checklist and verify each variable in Vercel Dashboard:

### Public (NEXT_PUBLIC_*) - Exposed to browser
- [ ] `NEXT_PUBLIC_APP_URL` ⚠️ **MISSING - ADD THIS**
- [x] `NEXT_PUBLIC_SUPABASE_URL` ✅ Already set
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅ Already set

### Server-only - Not exposed to browser
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (verify exists)
- [ ] `DATABASE_URL` (verify exists)
- [ ] `DIRECT_URL` (verify exists)
- [x] `GEMINI_API_KEY` ✅ Already set

### Legacy (can be removed if not used)
- Firebase variables (old authentication system)

## 🎉 After Setup

Once all environment variables are configured:

1. Vercel deployment will succeed
2. Exam share links will work correctly
3. URLs will use production domain (not localhost)
4. Students can access exams via share links
5. Authentication flow will return to exam after login

## 🔗 Quick Links

- Vercel Project: https://vercel.com/cherrychikooh-6502s-projects/lms-portal-optimized
- Environment Variables: https://vercel.com/cherrychikooh-6502s-projects/lms-portal-optimized/settings/environment-variables
- Supabase Auth Config: https://supabase.com/dashboard/project/rramkmudzrxaipukueuq/auth/url-configuration
- Deployment Guide: See `EXAM_SHARE_LINK_DEPLOYMENT.md`

## ⏭️ Next Steps

1. ⚠️ Add `NEXT_PUBLIC_APP_URL` to Vercel (required)
2. ✅ Verify other env vars exist
3. ✅ Update Supabase redirect URLs
4. 🚀 Deploy to Vercel
5. 🧪 Test deployed application

---

**Status**: Ready to deploy once `NEXT_PUBLIC_APP_URL` is added to Vercel ✨
