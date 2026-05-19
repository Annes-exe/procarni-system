-- Agregar columna 'website' (Enlace) a la tabla suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS website TEXT DEFAULT NULL;

COMMENT ON COLUMN public.suppliers.website IS 'Enlace web o URL del proveedor (sitio web, catálogo en línea, etc.)';
