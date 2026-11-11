-- Migration: Agregar columna material_mappings_data a dotacion_operational_config
-- Permite persistir de forma centralizada en Supabase la vinculación de los 5 insumos de dotación con el catálogo de materiales.

ALTER TABLE public.dotacion_operational_config
ADD COLUMN IF NOT EXISTS material_mappings_data JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dotacion_operational_config.material_mappings_data IS 'Vinculación persistente de los 5 productos de dotación con los materiales oficiales del catálogo.';
