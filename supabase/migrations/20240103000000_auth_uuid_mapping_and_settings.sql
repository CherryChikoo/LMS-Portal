-- 1. Create the settings table for branding
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    "companyName" TEXT,
    "companySubtitle" TEXT,
    "logoBase64" TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and add a permissive policy for settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive All - Settings" ON public.settings;
CREATE POLICY "Permissive All - Settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Insert fallback branding
INSERT INTO public.settings (id, "companyName", "companySubtitle") 
VALUES ('branding', 'LMS Portal', 'Welcome to the LMS Portal')
ON CONFLICT (id) DO NOTHING;

-- 2. Add authId to users and students
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "authId" UUID;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS "authId" UUID;

-- 3. Map the authId by matching emails between public.users and auth.users
UPDATE public.users u
SET "authId" = au.id
FROM auth.users au
WHERE au.email = u.email AND u."authId" IS NULL;

-- Cascade the authId to students
UPDATE public.students s
SET "authId" = u."authId"
FROM public.users u
WHERE s.id = u.id AND u."authId" IS NOT NULL AND s."authId" IS NULL;
