-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 2. Configuración de la URL del proyecto en el Vault
-- IMPORTANTE: Cambiar la URL por la de producción al ejecutar en ese entorno
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'supabase_url') THEN
        PERFORM vault.create_secret('https://hsspvhxneuetpatafdzy.supabase.co', 'supabase_url', 'URL base del proyecto para Edge Functions');
    END IF;
END $$;

-- 3. Función auxiliar para obtener la URL del Vault
CREATE OR REPLACE FUNCTION public.get_project_url()
RETURNS TEXT AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = vault, public;

-- 4. Tabla para el seguimiento de los re-envíos
CREATE TABLE IF NOT EXISTS public.scheduled_repush (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    next_push_at TIMESTAMPTZ NOT NULL,
    interval_index INT NOT NULL DEFAULT 1, -- 1: 2h, 2: 1h, 3: 45m, 4: 30m, 5: 15m
    status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, cancelled
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.scheduled_repush ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Solo administradores pueden gestionar re-intentos') THEN
        CREATE POLICY "Solo administradores pueden gestionar re-intentos"
        ON public.scheduled_repush FOR ALL TO service_role, postgres USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins pueden ver re-intentos') THEN
        CREATE POLICY "Admins pueden ver re-intentos"
        ON public.scheduled_repush FOR SELECT TO authenticated USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
        );
    END IF;
END $$;

-- 5. Función de lógica de intervalos (TIEMPOS REALES)
CREATE OR REPLACE FUNCTION public.get_next_repush_interval(idx INT)
RETURNS INTERVAL AS $$
BEGIN
    RETURN CASE 
        WHEN idx = 1 THEN INTERVAL '1 hour'    -- 1er retry: 2h (fijo), el siguiente a la 1h
        WHEN idx = 2 THEN INTERVAL '45 minutes'
        WHEN idx = 3 THEN INTERVAL '30 minutes'
        WHEN idx = 4 THEN INTERVAL '15 minutes'
        ELSE NULL 
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Procesador de la cola de re-envíos
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
        -- Si ya fue leída, cancelar re-envío
        IF r.is_read = true THEN
            UPDATE public.scheduled_repush SET status = 'cancelled' WHERE id = r.id;
            CONTINUE;
        END IF;

        -- Disparar Edge Function (Modo RETRY)
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

        -- Calcular siguiente intervalo
        next_interval := public.get_next_repush_interval(r.interval_index);
        
        IF next_interval IS NOT NULL THEN
            UPDATE public.scheduled_repush 
            SET next_push_at = NOW() + next_interval,
                interval_index = r.interval_index + 1
            WHERE id = r.id;
        ELSE
            UPDATE public.scheduled_repush SET status = 'sent' WHERE id = r.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Modificar el disparador inicial de notificaciones
CREATE OR REPLACE FUNCTION public.handle_new_notification_push()
RETURNS TRIGGER AS $$
BEGIN
  -- Primer aviso inmediato (Solo para recordatorios)
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

    -- Agendar el PRIMER re-intento (+2 horas desde ahora)
    INSERT INTO public.scheduled_repush (notification_id, next_push_at, interval_index)
    VALUES (NEW.id, NOW() + INTERVAL '2 hours', 1);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Permisos necesarios para el esquema net (Cron lo necesita)
GRANT USAGE ON SCHEMA net TO authenticated, service_role, postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO authenticated, service_role, postgres;

-- 9. Programar el Cron (Ejecutar cada minuto)
DO $$
BEGIN
    -- Intentamos borrarla solo si existe para evitar el error XX000
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-repush-notifications') THEN
        PERFORM cron.unschedule('process-repush-notifications');
    END IF;
END $$;
-- Ahora sí la agendamos limpiamente
SELECT cron.schedule(
  'process-repush-notifications',
  '* * * * *', -- Cada minuto
  'SELECT public.process_repush_queue()'
);