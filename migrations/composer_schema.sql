-- ============================================
-- DreamPlay Composer: 'composer' Schema Migration
-- Targets a fresh schema with Clerk Auth (TEXT user_id)
-- ============================================

CREATE SCHEMA IF NOT EXISTS composer;

-- Set search path to composer for the duration of this script
SET search_path TO composer;

-- 1. Configurations Table
CREATE TABLE IF NOT EXISTS configurations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL, -- Clerk User ID
    title TEXT NOT NULL DEFAULT 'Untitled',
    audio_url TEXT,
    xml_url TEXT,
    midi_url TEXT,
    anchors JSONB DEFAULT '[{"measure": 1, "time": 0}]'::jsonb,
    beat_anchors JSONB,
    subdivision INT DEFAULT 4,
    is_level2 BOOLEAN DEFAULT false,
    ai_anchors JSONB,
    music_font TEXT DEFAULT 'Petaluma',
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Video Exports Table
CREATE TABLE IF NOT EXISTS video_exports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    config_id UUID REFERENCES configurations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, -- Clerk User ID
    status TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','processing','completed','failed')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    mp4_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_configs_user ON configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_video_exports_config ON video_exports(config_id);
CREATE INDEX IF NOT EXISTS idx_video_exports_status ON video_exports(status);
CREATE INDEX IF NOT EXISTS idx_video_exports_user ON video_exports(user_id);

-- 4. Updated-at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_updated_at ON configurations;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON video_exports;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON video_exports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS (Enable but allow service-role full access)
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_exports ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default, but we can add policies for future use
-- For now, we rely on the service-role key for all operations.
