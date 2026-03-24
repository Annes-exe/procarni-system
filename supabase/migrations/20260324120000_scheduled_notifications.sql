-- 0. Portable Configuration via Supabase Vault
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'supabase_url') THEN
        PERFORM vault.create_secret('https://hsspvhxneuetpatafdzy.supabase.co', 'supabase_url', 'Project URL for notifications');
    END IF;
END $$;

-- Helper to get project URL from Vault
CREATE OR REPLACE FUNCTION public.get_project_url()
RETURNS TEXT AS $$
DECLARE
    url TEXT;
BEGIN
    SELECT decrypted_secret INTO url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
    RETURN url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1. Create tracking table
CREATE TABLE IF NOT EXISTS public.scheduled_repush (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    next_push_at TIMESTAMPTZ NOT NULL,
    interval_index INT NOT NULL DEFAULT 1, -- 1 to 5
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cron performance
CREATE INDEX IF NOT EXISTS idx_scheduled_repush_next_push ON public.scheduled_repush (next_push_at) WHERE status = 'pending';

-- 2. Function to calculate next interval
CREATE OR REPLACE FUNCTION public.get_next_repush_interval(idx INT)
RETURNS INTERVAL AS $$
BEGIN
    RETURN CASE 
        WHEN idx = 1 THEN INTERVAL '1 hour'   -- After the 2h retry, next is 1h
        WHEN idx = 2 THEN INTERVAL '45 minutes'
        WHEN idx = 3 THEN INTERVAL '30 minutes'
        WHEN idx = 4 THEN INTERVAL '15 minutes'
        ELSE NULL -- No more retries after index 5
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Queue Processor
CREATE OR REPLACE FUNCTION public.process_repush_queue()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    next_interval INTERVAL;
BEGIN
    FOR r IN 
        SELECT sr.*, n.title, n.message, n.user_id, n.type, n.is_read
        FROM public.scheduled_repush sr
        JOIN public.notifications n ON sr.notification_id = n.id
        WHERE sr.next_push_at <= NOW() AND sr.status = 'pending'
    LOOP
        -- Check if already read in the system
        IF r.is_read THEN
            UPDATE public.scheduled_repush SET status = 'cancelled' WHERE id = r.id;
            CONTINUE;
        END IF;

        -- Trigger Push via Edge Function
        -- We use the URL from the Vault for portability
        PERFORM net.http_post(
            url := (public.get_project_url() || '/functions/v1/send-notification'),
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := jsonb_build_object(
                'type', 'RETRY',
                'notification_id', r.notification_id,
                'record', jsonb_build_object(
                    'title', r.title,
                    'message', r.message,
                    'user_id', r.user_id,
                    'type', r.type
                )
            )
        );



        -- Calculate next interval
        next_interval := public.get_next_repush_interval(r.interval_index);
        
        IF next_interval IS NOT NULL THEN
            UPDATE public.scheduled_repush 
            SET next_push_at = NOW() + next_interval,
                interval_index = r.interval_index + 1
            WHERE id = r.id;
        ELSE
            UPDATE public.scheduled_repush SET status = 'completed' WHERE id = r.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Schedule Cron (every minute)
-- First unschedule if exists to avoid duplicates
SELECT cron.unschedule('process-repush-notifications');
SELECT cron.schedule('process-repush-notifications', '* * * * *', 'SELECT public.process_repush_queue()');

-- 5. Update handle_new_notification_push to trigger initial and schedule retries
CREATE OR REPLACE FUNCTION public.handle_new_notification_push()
RETURNS trigger AS $$
BEGIN
  -- Trigger initial Edge Function call ONLY for 'reminder'
  -- Document CRUD notifications will skip the push/retry logic
  IF NEW.type = 'reminder' THEN
    PERFORM net.http_post(
        url := (public.get_project_url() || '/functions/v1/send-notification'),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'type', 'INSERT',
          'table', 'notifications',
          'record', row_to_json(NEW),
          'schema', 'public'
        )
    );

    -- Schedule the FIRST retry (+2 hours from now)
    INSERT INTO public.scheduled_repush (notification_id, next_push_at, interval_index)
    VALUES (NEW.id, NOW() + INTERVAL '2 hours', 1);
  END IF;

  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
