-- Migration: Crear tabla y políticas para Historial Centralizado de Tasas de Cambio Oficiales (BCV)
-- Fecha: 2026-10-06

CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_date DATE NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR')),
    rate NUMERIC NOT NULL CHECK (rate > 0),
    source TEXT NOT NULL DEFAULT 'BCV',
    effective_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_exchange_rates_currency_date UNIQUE (currency, rate_date)
);

-- Índices para búsquedas rápidas por moneda y fecha
CREATE INDEX IF NOT EXISTS idx_exchange_rates_curr_date ON public.exchange_rates(currency, rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON public.exchange_rates(rate_date DESC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'exchange_rates' AND policyname = 'Allow authenticated users to read exchange rates'
    ) THEN
        CREATE POLICY "Allow authenticated users to read exchange rates"
        ON public.exchange_rates
        FOR SELECT
        TO authenticated
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
END
$$;

COMMENT ON TABLE public.exchange_rates IS 'Histórico centralizado de tasas de cambio oficiales (BCV) para autocompletado y caché.';
