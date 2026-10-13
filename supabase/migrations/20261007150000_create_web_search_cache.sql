-- Migration: Create web_search_cache table for storing AI supplier search results
-- Time-to-Live: 10 days

CREATE TABLE IF NOT EXISTS public.web_search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_key TEXT UNIQUE NOT NULL,
    search_term TEXT NOT NULL,
    region TEXT NOT NULL,
    category TEXT,
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
    hit_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 days')
);

CREATE INDEX IF NOT EXISTS idx_web_search_cache_key ON public.web_search_cache(query_key);
CREATE INDEX IF NOT EXISTS idx_web_search_cache_expires ON public.web_search_cache(expires_at);

ALTER TABLE public.web_search_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on web_search_cache" ON public.web_search_cache;
DROP POLICY IF EXISTS "Allow service_role full access on web_search_cache" ON public.web_search_cache;
DROP POLICY IF EXISTS "Allow full access on web_search_cache" ON public.web_search_cache;

CREATE POLICY "Allow full access on web_search_cache"
    ON public.web_search_cache FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

