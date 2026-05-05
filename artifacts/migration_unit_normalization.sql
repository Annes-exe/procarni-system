-- =============================================================================
-- MIGRACIÓN: NORMALIZACIÓN DE UNIDADES DE MEDIDA EN HISTORIAL Y MATERIALES
-- =============================================================================

BEGIN;

-- 1. Añadir columna unit_id a la tabla de materiales si no existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='materials' AND column_name='unit_id') THEN
        ALTER TABLE public.materials ADD COLUMN unit_id UUID REFERENCES public.units_of_measure(id);
    END IF;
END $$;

-- 2. Backfill: Sincronizar materiales.unit_id basado en el texto de materials.unit
UPDATE public.materials m
SET unit_id = u.id
FROM public.units_of_measure u
WHERE UPPER(TRIM(m.unit)) = UPPER(TRIM(u.name))
AND m.unit_id IS NULL;

-- 3. Asegurar que price_history tenga unit_id (ya existe, pero normalizamos nulos si los hubiera)
-- Intentamos rescatar la unidad desde la Orden de Compra relacionada o el material
UPDATE public.price_history ph
SET unit_id = COALESCE(
    (SELECT unit_id FROM public.purchase_order_items poi WHERE poi.order_id = ph.purchase_order_id AND poi.material_id = ph.material_id LIMIT 1),
    (SELECT unit_id FROM public.materials m WHERE m.id = ph.material_id)
)
WHERE ph.unit_id IS NULL;

-- 4. Actualización de Restricciones en supplier_materials
-- Eliminamos restricciones antiguas de (supplier, material) para favorecer (supplier, material, unit)
-- Nota: La restricción de clave compuesta ya fue detectada, aseguramos que sea la única activa.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_materials_supplier_id_material_id_key') THEN
        ALTER TABLE public.supplier_materials DROP CONSTRAINT supplier_materials_supplier_id_material_id_key;
    END IF;
END $$;

-- 5. Comprobación de integridad: Listar registros que aún no tienen unidad asignada (para revisión manual)
-- SELECT id, name, unit FROM public.materials WHERE unit_id IS NULL;

COMMIT;
