-- Consolidado de Migración: Sistema de Notificaciones Automáticas (Documentos y Comparativas)
-- Este archivo configura los triggers y la función centralizada para notificaciones CRUD.

-- 1. Crear o Actualizar la Función de Notificación Centralizada
CREATE OR REPLACE FUNCTION handle_document_crud_notification()
RETURNS TRIGGER AS $$
DECLARE
    doc_type TEXT;
    doc_abbr TEXT;
    doc_name TEXT;
    doc_code TEXT;
    action_text TEXT;
    user_email TEXT;
    target_date TIMESTAMP WITH TIME ZONE;
    target_seq INTEGER;
    doc_display_name TEXT;
BEGIN
    -- Determinar tipo de documento y abreviatura
    IF TG_TABLE_NAME = 'quote_requests' THEN
        doc_type := 'quote_request';
        doc_abbr := 'SC';
        doc_name := 'Solicitud de Cotización';
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
        doc_type := 'purchase_order';
        doc_abbr := 'OC';
        doc_name := 'Orden de Compra';
    ELSIF TG_TABLE_NAME = 'service_orders' THEN
        doc_type := 'service_order';
        doc_abbr := 'OS';
        doc_name := 'Orden de Servicio';
    ELSIF TG_TABLE_NAME = 'quote_comparisons' THEN
        doc_type := 'quote_comparison';
        doc_abbr := 'CC';
        doc_name := 'Comparativa de Cotizaciones';
    END IF;

    -- Extraer datos según la operación (INSERT/UPDATE vs DELETE)
    IF TG_OP = 'DELETE' THEN
        target_date := OLD.created_at;
        IF TG_TABLE_NAME = 'quote_comparisons' THEN
            doc_display_name := OLD.name;
        ELSE
            target_seq := OLD.sequence_number;
        END IF;
    ELSE
        target_date := NEW.created_at;
        IF TG_TABLE_NAME = 'quote_comparisons' THEN
            doc_display_name := NEW.name;
        ELSE
            target_seq := NEW.sequence_number;
        END IF;
    END IF;

    -- Asegurar que tengamos una fecha para el formato
    IF target_date IS NULL THEN
        target_date := NOW();
    END IF;

    -- Construir el código visual del documento [ABBR-YYYY-MM-000] o [Nombre de Comparativa]
    IF TG_TABLE_NAME = 'quote_comparisons' THEN
        doc_code := '[' || COALESCE(doc_display_name, 'Sin Nombre') || ']';
    ELSIF target_seq IS NOT NULL THEN
        doc_code := '[' || doc_abbr || '-' || to_char(target_date, 'YYYY-MM-') || LPAD(target_seq::text, 3, '0') || ']';
    ELSE
        doc_code := '[' || (CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END) || ']';
    END IF;

    -- Determinar la acción realizada
    IF TG_OP = 'INSERT' THEN
        action_text := 'creó';
    ELSIF TG_OP = 'UPDATE' THEN
        -- Lógica especial para cambios a ARCHIVADO
        IF TG_TABLE_NAME IN ('quote_requests', 'purchase_orders', 'service_orders') THEN
            IF OLD.status <> 'Archived' AND NEW.status = 'Archived' THEN
                action_text := 'archivó';
            ELSIF OLD.status = 'Archived' AND NEW.status <> 'Archived' THEN
                action_text := 'desarchivó';
            ELSE
                action_text := 'actualizó';
            END IF;
        ELSE
            action_text := 'actualizó';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        action_text := 'eliminó';
    END IF;

    -- Obtener el correo del usuario que realiza la acción (si está disponible)
    SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

    -- Insertar la notificación para TODOS los usuarios registrados
    -- Usamos SECURITY DEFINER para que un usuario pueda insertar en notificaciones de otros
    INSERT INTO public.notifications (user_id, title, message, type, resource_type, resource_id)
    SELECT 
        id, 
        'Actualización de Documento',
        COALESCE(user_email, 'Un usuario') || ' ' || action_text || ' ' || doc_name || ' ' || doc_code,
        'crud',
        doc_type,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
    FROM auth.users;

    -- Lógica de Recordatorio Automático (Solo para Documentos con estado Borrador)
    IF TG_TABLE_NAME IN ('quote_requests', 'purchase_orders', 'service_orders') THEN
        IF (TG_OP = 'INSERT' AND NEW.status = 'Draft') OR (TG_OP = 'UPDATE' AND NEW.status = 'Draft' AND OLD.status != 'Draft') THEN
            DECLARE
                draft_count INTEGER;
            BEGIN
                EXECUTE format('SELECT count(*) FROM public.%I WHERE status = ''Draft''', TG_TABLE_NAME) INTO draft_count;
                IF draft_count > 5 THEN
                    INSERT INTO public.notifications (user_id, title, message, type, resource_type)
                    SELECT 
                        id,
                        'Recordatorio de Gestión',
                        'Tienes ' || draft_count || ' ' || doc_name || ' (s) en estado BORRADOR. Recuerda gestionarlos.',
                        'reminder',
                        doc_type
                    FROM auth.users;
                END IF;
            END;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- Permite notificar a todos sin errores 403

-- 2. Asegurar que la función use el esquema público
ALTER FUNCTION handle_document_crud_notification() SET search_path = public;

-- 3. Crear Triggers en las tablas principales

-- Solicitudes de Cotización (SC)
DROP TRIGGER IF EXISTS tr_quote_requests_notification ON public.quote_requests;
CREATE TRIGGER tr_quote_requests_notification
AFTER INSERT OR UPDATE OR DELETE ON public.quote_requests
FOR EACH ROW EXECUTE FUNCTION handle_document_crud_notification();

-- Órdenes de Compra (OC)
DROP TRIGGER IF EXISTS tr_purchase_orders_notification ON public.purchase_orders;
CREATE TRIGGER tr_purchase_orders_notification
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION handle_document_crud_notification();

-- Órdenes de Servicio (OS)
DROP TRIGGER IF EXISTS tr_service_orders_notification ON public.service_orders;
CREATE TRIGGER tr_service_orders_notification
AFTER INSERT OR UPDATE OR DELETE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION handle_document_crud_notification();

-- Comparativas de Cotización (CC)
DROP TRIGGER IF EXISTS tr_quote_comparisons_notification ON public.quote_comparisons;
CREATE TRIGGER tr_quote_comparisons_notification
AFTER INSERT OR UPDATE OR DELETE ON public.quote_comparisons
FOR EACH ROW EXECUTE FUNCTION handle_document_crud_notification();
