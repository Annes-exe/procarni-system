-- Migration for Temporary Assets Storage and Cleanup
-- Created: 2026-03-27

-- 1. Create the table for tracking temporary files
CREATE TABLE IF NOT EXISTS public.temporary_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cloudinary_public_id TEXT NOT NULL,
    url TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Setup RLS
ALTER TABLE public.temporary_assets ENABLE ROW LEVEL SECURITY;

-- 2.1 Allow service_role complete access
CREATE POLICY "Allow service_role full access"
ON public.temporary_assets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2.2 Allow authenticated users to read only (for the frontend link generation check if needed)
CREATE POLICY "Allow authenticated read access"
ON public.temporary_assets
FOR SELECT
TO authenticated
USING (true);

-- 2.3 Allow authenticated users to insert (if needed by frontend, though service_role is safer)
CREATE POLICY "Allow authenticated insert"
ON public.temporary_assets
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Cleanup logic with pg_cron
-- IMPORTANT: pg_cron must be enabled in the project via Supabase Dashboard or extensions.
-- This part may fail if the extension is not active, but it serves as a record of intent.

-- Enable pg_cron if it exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the cleanup job every 6 hours
-- It calls the Edge Function cleanup-temp-assets via HTTP POST
-- Replace [SUPABASE_URL] and [SERVICE_ROLE_KEY] with actual values or use a Net-Worker approach
-- Note: It is better to use pg_net for async HTTP calls in the job.

/*
SELECT cron.schedule(
    'cleanup-temp-assets-job',
    '0 0,6,12,18 * * *',
    $$
    SELECT
      net.http_post(
        url := 'https://hsspvhxneuetpatafdzy.supabase.co/functions/v1/cleanup-temp-assets',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
        body := '{}'::jsonb
      ) as request_id;
    $$
);
*/

-- Add indexes for performance on expiration checks
CREATE INDEX IF NOT EXISTS idx_temporary_assets_expires_at ON public.temporary_assets (expires_at);
