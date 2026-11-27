-- Migration: Sincronización Programada y Estructura de Tasas de Cambio Oficiales (BCV)
-- Fecha: 2026-11-26 (Actualizada: PK Natural Compuesta currency, rate_date)

-- 1. Asegurar que las extensiones necesarias estén activas
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Crear o reestructurar tabla exchange_rates con PK compuesta (currency, rate_date)
CREATE TABLE IF NOT EXISTS public.exchange_rates (
    rate_date DATE NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR')),
    rate NUMERIC NOT NULL CHECK (rate > 0),
    source TEXT NOT NULL DEFAULT 'BCV',
    effective_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (currency, rate_date)
);

-- Si la tabla ya existía previamente con columna 'id UUID', migrarla a PK compuesta
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'exchange_rates' AND column_name = 'id'
    ) THEN
        ALTER TABLE public.exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_pkey;
        ALTER TABLE public.exchange_rates DROP CONSTRAINT IF EXISTS uq_exchange_rates_currency_date;
        ALTER TABLE public.exchange_rates DROP COLUMN IF EXISTS id;
        
        -- Si aún no tiene la clave primaria compuesta, agregarla
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_schema = 'public' AND table_name = 'exchange_rates' AND constraint_type = 'PRIMARY KEY'
        ) THEN
            ALTER TABLE public.exchange_rates ADD PRIMARY KEY (currency, rate_date);
        END IF;
    END IF;
END $$;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON public.exchange_rates(rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_curr_date ON public.exchange_rates(currency, rate_date DESC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS: Lectura pública (anon y authenticated)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'exchange_rates' AND policyname = 'Allow public to read exchange rates'
    ) THEN
        CREATE POLICY "Allow public to read exchange rates"
        ON public.exchange_rates
        FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'exchange_rates' AND policyname = 'Allow authenticated users to insert/update exchange rates'
    ) THEN
        CREATE POLICY "Allow authenticated users to insert/update exchange rates"
        ON public.exchange_rates
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- 4. Función auxiliar para disparar la sincronización de tasas desde la base de datos
CREATE OR REPLACE FUNCTION public.trigger_sync_exchange_rates()
RETURNS VOID AS $$
DECLARE
    project_url TEXT;
BEGIN
    -- Obtener la URL del proyecto usando la función existente o fallback
    BEGIN
        SELECT public.get_project_url() INTO project_url;
    EXCEPTION WHEN OTHERS THEN
        project_url := NULL;
    END;

    IF project_url IS NULL OR project_url = '' THEN
        project_url := 'https://hsspvhxneuetpatafdzy.supabase.co';
    END IF;

    -- Llamar a la Edge Function sync-exchange-rates
    PERFORM net.http_post(
        url := (project_url || '/functions/v1/sync-exchange-rates'),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Programar los Cron Jobs para sincronización diaria automática
-- Horarios en Venezuela (UTC-4):
-- - 9:00 AM VET = 13:00 UTC (Apertura bancaria)
-- - 5:30 PM VET = 21:30 UTC (Cierre bancario y publicación de nueva tasa BCV)

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-exchange-rates-morning') THEN
        PERFORM cron.unschedule('sync-exchange-rates-morning');
    END IF;
    
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-exchange-rates-afternoon') THEN
        PERFORM cron.unschedule('sync-exchange-rates-afternoon');
    END IF;
END $$;

-- 9:00 AM Venezuela (Lunes a Viernes)
SELECT cron.schedule(
    'sync-exchange-rates-morning',
    '0 13 * * 1-5',
    'SELECT public.trigger_sync_exchange_rates()'
);

-- 5:30 PM Venezuela (Lunes a Viernes)
SELECT cron.schedule(
    'sync-exchange-rates-afternoon',
    '30 21 * * 1-5',
    'SELECT public.trigger_sync_exchange_rates()'
);
