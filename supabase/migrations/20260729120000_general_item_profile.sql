-- MIGRACIÓN: REGISTRO DE SOPORTE PARA EL NUEVO PERFIL GENERAL DE ÍTEMS
-- Esta migración documenta y confirma la disponibilidad de la columna search_aliases en la tabla materials.
-- La columna search_aliases es de tipo text[] y permite almacenar múltiples aliases/variaciones de nombre para búsquedas.

DO $$
BEGIN
    -- Verificar que la columna search_aliases existe en public.materials
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'materials' 
        AND column_name = 'search_aliases'
    ) THEN
        ALTER TABLE public.materials ADD COLUMN search_aliases text[] DEFAULT '{}'::text[];
    END IF;
END $$;

COMMENT ON COLUMN public.materials.search_aliases IS 'Array de textos conteniendo alias y variaciones de nombres para búsquedas unificadas de compras.';
