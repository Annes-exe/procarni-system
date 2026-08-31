-- Agregar columna 'rubros' a la tabla suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rubros TEXT DEFAULT NULL;

COMMENT ON COLUMN public.suppliers.rubros IS 'Rubros generales del proveedor (etiquetas separadas por comas)';
