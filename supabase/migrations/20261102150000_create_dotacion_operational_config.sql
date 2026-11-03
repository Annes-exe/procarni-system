-- Migration: Crear tabla y políticas para configuración de parámetros operativos de dotación
-- Permite almacenar de forma persistente y compartida en Supabase los parámetros de dotación:
-- Comedor, Finca, Planta, Cafetería, Presentaciones de Empaque y Tolerancias de Sobrante.

CREATE TABLE IF NOT EXISTS public.dotacion_operational_config (
    id TEXT PRIMARY KEY DEFAULT 'global_config',
    comedor_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    finca_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    papel_uso_diario_bultos NUMERIC NOT NULL DEFAULT 3,
    azucar_uso_bultos_map JSONB NOT NULL DEFAULT '{"primera": 1.5, "segunda": 1.5}'::jsonb,
    presentations_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    surplus_tolerance_percent NUMERIC NOT NULL DEFAULT 25,
    arroz_max_surplus_kg NUMERIC NOT NULL DEFAULT 18,
    global_purchase_mode TEXT NOT NULL DEFAULT 'mixto',
    contingency_combos_pc INTEGER NOT NULL DEFAULT 0,
    contingency_combos_ma INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.dotacion_operational_config ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para usuarios autenticados
DROP POLICY IF EXISTS "Allow authenticated users to read dotacion config" ON public.dotacion_operational_config;
CREATE POLICY "Allow authenticated users to read dotacion config" ON public.dotacion_operational_config
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert or update dotacion config" ON public.dotacion_operational_config;
CREATE POLICY "Allow authenticated users to insert or update dotacion config" ON public.dotacion_operational_config
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.dotacion_operational_config IS 'Configuración operativa centralizada y persistente de dotación quincenal.';
