-- 1. Actualizar la lógica de detección de variaciones de precio
CREATE OR REPLACE FUNCTION public.handle_price_variation_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    last_price NUMERIC;
    material_name TEXT;
    supplier_name TEXT;
    variation_text TEXT;
    doc_type TEXT;
    doc_abbr TEXT;
    doc_code TEXT;
    doc_date TIMESTAMP WITH TIME ZONE;
    doc_seq INTEGER;
    comparison_type TEXT;
BEGIN
    -- Get material and supplier names
    SELECT name INTO material_name FROM public.materials WHERE id = NEW.material_id;
    SELECT name INTO supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;

    -- 1. Intentar encontrar el último precio para este MISMO proveedor
    SELECT unit_price INTO last_price 
    FROM public.price_history 
    WHERE material_id = NEW.material_id 
      AND supplier_id = NEW.supplier_id 
      AND id != NEW.id
    ORDER BY recorded_at DESC 
    LIMIT 1;

    IF last_price IS NOT NULL THEN
        comparison_type := '(mismo proveedor)';
    ELSE
        -- 2. Si no hay previo con este proveedor, buscar el último precio GLOBAL para este material
        SELECT unit_price INTO last_price 
        FROM public.price_history 
        WHERE material_id = NEW.material_id 
          AND id != NEW.id
        ORDER BY recorded_at DESC 
        LIMIT 1;
        
        IF last_price IS NOT NULL THEN
            comparison_type := '(referencia global)';
        END IF;
    END IF;

    -- Si encontramos un precio de referencia y hay variación
    IF last_price IS NOT NULL AND last_price != NEW.unit_price THEN
        IF NEW.unit_price > last_price THEN
            variation_text := 'subió';
        ELSE
            variation_text := 'bajó';
        END IF;

        -- Determinar qué documento disparó esto
        IF NEW.purchase_order_id IS NOT NULL THEN
            SELECT 
                'purchase_order', 
                'OC', 
                created_at, 
                sequence_number 
            INTO doc_type, doc_abbr, doc_date, doc_seq 
            FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
        ELSIF NEW.service_order_id IS NOT NULL THEN
            SELECT 
                'service_order', 
                'OS', 
                created_at, 
                sequence_number 
            INTO doc_type, doc_abbr, doc_date, doc_seq 
            FROM public.service_orders WHERE id = NEW.service_order_id;
        END IF;

        -- Formatear el código del documento
        IF doc_seq IS NOT NULL THEN
            doc_code := '[' || doc_abbr || '-' || to_char(COALESCE(doc_date, NEW.recorded_at), 'YYYY-MM-') || LPAD(doc_seq::text, 3, '0') || ']';
        ELSE
            doc_code := '[Nueva Orden]';
        END IF;

        INSERT INTO public.notifications (user_id, title, message, type, resource_type, resource_id)
        SELECT 
            id,
            'Alerta de Variación de Precio',
            'El precio de ' || COALESCE(material_name, 'un material') || ' ' || variation_text || ' a ' || NEW.unit_price || ' (antes ' || last_price || ') ' || comparison_type || ' en la ' || (CASE WHEN doc_abbr = 'OC' THEN 'Orden de Compra ' ELSE 'Orden de Servicio ' END) || doc_code || ' con el proveedor ' || COALESCE(supplier_name, 'desconocido'),
            'price_alert',
            'material',
            NEW.material_id
        FROM auth.users;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Actualizar el trigger de salida hacia push
CREATE OR REPLACE FUNCTION public.handle_new_notification_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Permitir tipos 'reminder' y 'price_alert' para notificaciones push
    IF NEW.type IN ('reminder', 'price_alert') THEN
        -- Insertar en la cola de repush
        INSERT INTO public.scheduled_repush (notification_id, next_push_at)
        VALUES (NEW.id, NOW() + INTERVAL '5 minutes');

        -- Llamar a la Edge Function
        PERFORM net.http_post(
            url := (public.get_project_url() || '/functions/v1/send-notification'),
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := jsonb_build_object(
              'type', 'INSERT',
              'table', 'notifications',
              'record', row_to_json(NEW),
              'schema', 'public'
            )
        );
    END IF;
    RETURN NEW;
END;
$function$;
