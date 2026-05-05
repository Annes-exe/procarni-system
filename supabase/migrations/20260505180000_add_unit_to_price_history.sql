-- Add unit tracking to price history for better reporting and traceability
ALTER TABLE public.price_history ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units_of_measure(id);
ALTER TABLE public.price_history ADD COLUMN IF NOT EXISTS unit TEXT;

-- Update existing price history if possible by joining with materials
UPDATE public.price_history ph
SET unit = m.unit
FROM public.materials m
WHERE ph.material_id = m.id AND ph.unit IS NULL;

-- Update existing price history unit_id by joining with materials and units
UPDATE public.price_history ph
SET unit_id = u.id
FROM public.materials m
JOIN public.units_of_measure u ON (LOWER(u.name) = LOWER(m.unit))
WHERE ph.material_id = m.id AND ph.unit_id IS NULL;
