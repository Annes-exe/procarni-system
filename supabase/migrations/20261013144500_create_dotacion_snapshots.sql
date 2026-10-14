-- Migration: Create dotacion_snapshots table
CREATE TABLE IF NOT EXISTS public.dotacion_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    quincena TEXT NOT NULL CHECK (quincena IN ('primera', 'segunda')),
    employees_pc INTEGER NOT NULL DEFAULT 0,
    employees_ma INTEGER NOT NULL DEFAULT 0,
    total_employees INTEGER NOT NULL DEFAULT 0,
    stock_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    comedor_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    finca_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    presentations_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    enable_global_optimization BOOLEAN NOT NULL DEFAULT true,
    result_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_purchase_orders JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT
);

-- Enable RLS
ALTER TABLE public.dotacion_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view and insert snapshots
DROP POLICY IF EXISTS "Allow authenticated users to read dotacion_snapshots" ON public.dotacion_snapshots;
CREATE POLICY "Allow authenticated users to read dotacion_snapshots" ON public.dotacion_snapshots
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert dotacion_snapshots" ON public.dotacion_snapshots;
CREATE POLICY "Allow authenticated users to insert dotacion_snapshots" ON public.dotacion_snapshots
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update dotacion_snapshots" ON public.dotacion_snapshots;
CREATE POLICY "Allow authenticated users to update dotacion_snapshots" ON public.dotacion_snapshots
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete dotacion_snapshots" ON public.dotacion_snapshots;
CREATE POLICY "Allow authenticated users to delete dotacion_snapshots" ON public.dotacion_snapshots
    FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.dotacion_snapshots IS 'Historial de snapshots y relaciones de cálculo de dotación quincenal.';
