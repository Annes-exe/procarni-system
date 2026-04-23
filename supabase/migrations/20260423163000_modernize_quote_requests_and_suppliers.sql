-- Modernización de Solicitudes de Cotización y Proveedores
-- Fecha: 2026-04-23

-- 1. Asegurar que los proveedores tengan todos los campos necesarios para la nueva UI
DO $$ 
BEGIN
    -- Campos de contacto y social
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='suppliers' AND column_name='phone_2') THEN
        ALTER TABLE public.suppliers ADD COLUMN phone_2 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='suppliers' AND column_name='instagram') THEN
        ALTER TABLE public.suppliers ADD COLUMN instagram TEXT;
    END IF;
    -- Campo para alertas en la UI
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='suppliers' AND column_name='alert_comment') THEN
        ALTER TABLE public.suppliers ADD COLUMN alert_comment TEXT;
    END IF;
    -- Ubicación (ya deberían existir pero los aseguramos)
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='suppliers' AND column_name='city') THEN
        ALTER TABLE public.suppliers ADD COLUMN city TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='suppliers' AND column_name='state') THEN
        ALTER TABLE public.suppliers ADD COLUMN state TEXT;
    END IF;
END $$;

-- 2. Mejorar la trazabilidad de las Solicitudes de Cotización
ALTER TABLE public.quote_requests 
ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS send_method TEXT,
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 3. Crear función RPC para registrar assets temporales (usada en GenerateQuoteRequest.tsx)
-- Esta función permite a la UI registrar el link de Cloudinary de forma segura
CREATE OR REPLACE FUNCTION public.create_temporary_asset(
    p_cloudinary_public_id TEXT,
    p_url TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.temporary_assets (
        cloudinary_public_id,
        url,
        expires_at
    )
    VALUES (
        p_cloudinary_public_id,
        p_url,
        p_expires_at
    )
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- 4. Actualizar restricciones de estado para quote_requests si es necesario
-- El frontend ahora usa el estado 'Sent'
DO $$ 
BEGIN
    ALTER TABLE public.quote_requests 
    DROP CONSTRAINT IF EXISTS quote_requests_status_check;
    
    ALTER TABLE public.quote_requests 
    ADD CONSTRAINT quote_requests_status_check 
    CHECK (status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Approved'::text, 'Rejected'::text, 'Archived'::text]));
END $$;

-- 5. Comentarios para documentación
COMMENT ON COLUMN public.quote_requests.last_sent_at IS 'Fecha y hora del último envío al proveedor.';
COMMENT ON COLUMN public.quote_requests.send_method IS 'Método utilizado para el último envío (WhatsApp, Email, etc).';
COMMENT ON COLUMN public.quote_requests.pdf_url IS 'Enlace al documento PDF generado (usualmente temporal).';
COMMENT ON COLUMN public.suppliers.alert_comment IS 'Comentario de alerta que se muestra en la UI al seleccionar este proveedor.';
