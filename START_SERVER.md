# How to Start the Development Server

## Quick Start

```bash
cd lms-portal
npm run dev
```

Then open: **http://localhost:3000**

## If Port 3000 is Busy

Next.js will automatically suggest port 3001, 3002, etc.
Just press `Y` when prompted.

## If Build Fails

### Step 1: Regenerate Prisma Client
```bash
cd lms-portal
npx prisma generate
```

### Step 2: Clear Cache and Reinstall
```bash
rm -rf node_modules package-lock.json
npm install
```

### Step 3: Check Node Version
```bash
node --version
```
Should be: **18.17+** or **20+**

### Step 4: Start with Verbose Logging
```bash
npm run dev -- --verbose
```

## Common Issues

### Issue: "Port 3000 already in use"
**Solution**: Kill the process or use a different port
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or just accept the suggested port (3001)
```

### Issue: "Cannot find module '@prisma/client'"
**Solution**: Generate Prisma Client
```bash
npx prisma generate
```

### Issue: "DATABASE_URL is not defined"
**Solution**: Check `.env.local` file exists
```bash
# Should contain:
DATABASE_URL="postgresql://postgres.rramkmudzrxaipukueuq:..."
```

### Issue: Slow Loading/Delays
**Solution**: Already fixed in `src/lib/prisma.ts`
- Connection pool increased to 10
- Timeouts optimized
- See PERFORMANCE_FIXES.md for details

## Verify Server is Running

1. **Check Terminal Output**
   ```
   ✓ Ready in 3.2s
   ○ Local: http://localhost:3000
   ```

2. **Open Browser**
   - Navigate to http://localhost:3000
   - Should see login page

3. **Check Console**
   - Open browser DevTools (F12)
   - No red errors in console

## Performance Tips

### First Load
- May take 2-5 seconds (loading data from Supabase)
- Subsequent loads will be instant (cached)

### If Still Slow
1. Check your internet connection
2. Supabase database is in India (ap-south-1)
3. Consider upgrading Supabase plan for better performance

## Development Workflow

### Make Changes
```bash
# Files auto-reload on save
# No need to restart server
```

### Database Changes
```bash
# 1. Update schema
# Edit: prisma/schema.prisma

# 2. Generate migration
npx prisma migrate dev --name your_change_name

# 3. Apply to production
npx prisma migrate deploy
```

### Test Authentication
1. Go to /login
2. Try email/password OR Google login
3. Both should work (dual login enabled)

## Stop Server

Press `Ctrl+C` in terminal

## Production Build

```bash
npm run build
npm start
```

Open: http://localhost:3000

## Need Help?

Check these files:
- `PERFORMANCE_FIXES.md` - Performance optimizations
- `package.json` - Available scripts
- `.env.local` - Environment variables
- `prisma/schema.prisma` - Database schema

## Server Status

✅ Connection pool optimized (10 connections)
✅ Query timeouts configured (30s)
✅ Dual login enabled (email + Google)
✅ Error handling improved
✅ Cache system active

You're all set! 🚀
