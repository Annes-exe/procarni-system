-- Añadir columnas faltantes a la tabla de Solicitudes de Cotización (quote_requests)

-- 1. Añadir sequence_number para control numérico
ALTER TABLE public.quote_requests 
ADD COLUMN IF NOT EXISTS sequence_number INTEGER;

-- 2. Añadir fechas de emisión y vencimiento
ALTER TABLE public.quote_requests 
ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.quote_requests 
ADD COLUMN IF NOT EXISTS deadline_date DATE;

-- 3. Añadir observaciones si no existen
ALTER TABLE public.quote_requests 
ADD COLUMN IF NOT EXISTS observations TEXT;

-- 4. Actualizar comentarios de documentación
COMMENT ON COLUMN public.quote_requests.sequence_number IS 'Número correlativo para identificación de la solicitud.';
COMMENT ON COLUMN public.quote_requests.issue_date IS 'Fecha en la que se emitió la solicitud.';
COMMENT ON COLUMN public.quote_requests.deadline_date IS 'Fecha límite para recibir la cotización.';
