-- Ultimate Pianist: Combined Schema Migration
-- Run this manually against your Supabase instance
-- This extends the existing score-follower 'projects' table

-- Step 1: Rename projects → configurations (if migrating from score-follower DB)
-- ALTER TABLE public.projects RENAME TO configurations;

-- Step 2: If creating fresh, use this schema:
CREATE TABLE IF NOT EXISTS public.configurations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'Untitled',
    audio_url TEXT,
    xml_url TEXT,
    midi_url TEXT,
    anchors JSONB DEFAULT '[{"measure": 1, "time": 0}]'::jsonb,
    beat_anchors JSONB,
    subdivision INT DEFAULT 4,
    is_level2 BOOLEAN DEFAULT false,
    ai_anchors JSONB,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Add midi_url and is_published if table already exists
-- ALTER TABLE public.configurations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
-- ALTER TABLE public.configurations ADD COLUMN IF NOT EXISTS midi_url TEXT;
-- ALTER TABLE public.configurations ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Step 4: Updated-at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_updated_at ON public.configurations;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 5: RLS (enable but allow service-role full access)
ALTER TABLE public.configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access" ON public.configurations;

CREATE POLICY "Owners can manage their configurations" ON public.configurations
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Published configurations are public" ON public.configurations
    FOR SELECT
    TO anon, authenticated
    USING (is_published = true);
