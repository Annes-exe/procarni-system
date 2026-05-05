-- Migration to add unit traceability to price history
-- Created: 2026-05-05

-- 1. Add unit columns to price_history table
ALTER TABLE public.price_history 
ADD COLUMN IF NOT EXISTS unit TEXT,
ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);

-- 2. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_price_history_material_id ON public.price_history(material_id);
CREATE INDEX IF NOT EXISTS idx_price_history_unit_id ON public.price_history(unit_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON public.price_history(recorded_at DESC);
-- Composite index for the chart query: Filter by material, filter by currency, order by date
CREATE INDEX IF NOT EXISTS idx_price_history_chart_query ON public.price_history(material_id, currency, recorded_at DESC);

-- 3. Add comments for documentation
COMMENT ON COLUMN public.price_history.unit IS 'Textual representation of the unit at the time of transaction';
COMMENT ON COLUMN public.price_history.unit_id IS 'Reference to the unit of measure record';

-- 4. Update existing records if possible (backfill from materials)
UPDATE public.price_history ph
SET unit_id = m.unit_id
FROM public.materials m
WHERE ph.material_id = m.id
AND ph.unit_id IS NULL;

-- 5. Update the textual unit name as well
UPDATE public.price_history ph
SET unit = uom.name
FROM public.units_of_measure uom
WHERE ph.unit_id = uom.id
AND ph.unit IS NULL;
