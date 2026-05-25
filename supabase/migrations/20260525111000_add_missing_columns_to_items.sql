-- Migration: Add unit_id and was_recalculated columns to items and material tables
-- Created: 2026-05-25

BEGIN;

-- 1. Add unit_id (UUID references public.units_of_measure(id)) to tables
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);
ALTER TABLE public.supplier_materials ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);
ALTER TABLE public.quote_request_items ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);
ALTER TABLE public.supplier_quotes ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);
ALTER TABLE public.quote_comparison_items ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);
ALTER TABLE public.service_order_materials ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);

-- 2. Add was_recalculated (BOOLEAN) to items tables
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS was_recalculated BOOLEAN DEFAULT false;
ALTER TABLE public.service_order_items ADD COLUMN IF NOT EXISTS was_recalculated BOOLEAN DEFAULT false;
ALTER TABLE public.service_order_materials ADD COLUMN IF NOT EXISTS was_recalculated BOOLEAN DEFAULT false;

-- 3. Backfill unit_id for existing materials
UPDATE public.materials m
SET unit_id = u.id
FROM public.units_of_measure u
WHERE UPPER(TRIM(m.unit)) = UPPER(TRIM(u.name))
AND m.unit_id IS NULL;

-- 4. Backfill unit_id for existing quote_request_items
UPDATE public.quote_request_items qri
SET unit_id = COALESCE(
    (SELECT u.id FROM public.units_of_measure u WHERE UPPER(TRIM(qri.unit)) = UPPER(TRIM(u.name)) LIMIT 1),
    (SELECT m.unit_id FROM public.materials m WHERE m.id = qri.material_id)
)
WHERE qri.unit_id IS NULL;

-- 5. Backfill unit_id for existing purchase_order_items
UPDATE public.purchase_order_items poi
SET unit_id = COALESCE(
    (SELECT u.id FROM public.units_of_measure u WHERE UPPER(TRIM(poi.unit)) = UPPER(TRIM(u.name)) LIMIT 1),
    (SELECT m.unit_id FROM public.materials m WHERE m.id = poi.material_id)
)
WHERE poi.unit_id IS NULL;

-- 6. Backfill unit_id for existing service_order_materials
UPDATE public.service_order_materials som
SET unit_id = COALESCE(
    (SELECT u.id FROM public.units_of_measure u WHERE UPPER(TRIM(som.unit)) = UPPER(TRIM(u.name)) LIMIT 1),
    (SELECT m.unit_id FROM public.materials m WHERE m.id = som.material_id)
)
WHERE som.unit_id IS NULL;

-- 7. Backfill unit_id for other reference tables
UPDATE public.supplier_materials sm
SET unit_id = (SELECT m.unit_id FROM public.materials m WHERE m.id = sm.material_id)
WHERE sm.unit_id IS NULL;

UPDATE public.supplier_quotes sq
SET unit_id = (SELECT m.unit_id FROM public.materials m WHERE m.id = sq.material_id)
WHERE sq.unit_id IS NULL;

UPDATE public.quote_comparison_items qci
SET unit_id = (SELECT m.unit_id FROM public.materials m WHERE m.id = qci.material_id)
WHERE qci.unit_id IS NULL;

COMMIT;
