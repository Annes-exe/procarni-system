-- Update the audit log trigger function to support more tables and detailed descriptions
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_email TEXT;
    action_desc TEXT;
    table_name_es TEXT;
    record_id UUID;
    record_name TEXT := '';
    rec RECORD;
    rec_json JSONB;
    old_json JSONB;
    new_status TEXT := NULL;
    details_obj JSONB;
BEGIN
    -- Intentar obtener el email del usuario del JWT (Supabase auth)
    BEGIN
        user_email := current_setting('request.jwt.claims', true)::json->>'email';
    EXCEPTION WHEN OTHERS THEN
        user_email := 'Sistema';
    END;
    
    IF user_email IS NULL THEN
        user_email := 'Sistema DB';
    END IF;

    -- Traducir nombre de tabla
    CASE TG_TABLE_NAME
        WHEN 'companies' THEN table_name_es := 'Empresas';
        WHEN 'suppliers' THEN table_name_es := 'Proveedores';
        WHEN 'materials' THEN table_name_es := 'Materiales';
        WHEN 'supplier_materials' THEN table_name_es := 'Materiales de Proveedor';
        WHEN 'quote_requests' THEN table_name_es := 'Solicitudes de Cotización';
        WHEN 'quote_request_items' THEN table_name_es := 'Ítems de Solic. de Cotización';
        WHEN 'purchase_orders' THEN table_name_es := 'Órdenes de Compra';
        WHEN 'purchase_order_items' THEN table_name_es := 'Ítems de O.C.';
        WHEN 'supplier_quotes' THEN table_name_es := 'Cotizaciones de Proveedores';
        WHEN 'price_history' THEN table_name_es := 'Historial de Precios';
        WHEN 'fichas_tecnicas' THEN table_name_es := 'Fichas Técnicas';
        WHEN 'quote_comparisons' THEN table_name_es := 'Comparaciones de Cotización';
        WHEN 'quote_comparison_items' THEN table_name_es := 'Ítems de Comparativo';
        WHEN 'service_orders' THEN table_name_es := 'Órdenes de Servicio';
        WHEN 'service_order_items' THEN table_name_es := 'Servicios de O.S.';
        WHEN 'service_order_materials' THEN table_name_es := 'Materiales de O.S.';
        WHEN 'material_categories' THEN table_name_es := 'Categorías de Materiales';
        WHEN 'units_of_measure' THEN table_name_es := 'Unidades de Medida';
        WHEN 'profiles' THEN table_name_es := 'Usuarios';
        ELSE table_name_es := TG_TABLE_NAME;
    END CASE;

    IF TG_OP = 'DELETE' THEN
        rec := OLD;
    ELSE
        rec := NEW;
    END IF;

    -- Safely get ID
    BEGIN
        rec_json := to_jsonb(rec);
        IF rec_json ? 'id' THEN
            record_id := (rec_json->>'id')::UUID;
        ELSE
            record_id := NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        record_id := NULL;
    END;

    -- Check for status changes on UPDATE
    IF TG_OP = 'UPDATE' THEN
        BEGIN
            old_json := to_jsonb(OLD);
            -- Check if 'status' field exists and changed
            IF old_json ? 'status' AND rec_json ? 'status' THEN
                IF old_json->>'status' IS DISTINCT FROM rec_json->>'status' THEN
                    new_status := rec_json->>'status';
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            new_status := NULL;
        END;
    END IF;

    -- Extraer nombre representativo si existe en el JSONB del registro
    BEGIN
        IF rec_json ? 'name' AND rec_json->>'name' IS NOT NULL THEN 
            record_name := rec_json ->> 'name';
        ELSIF rec_json ? 'material_name' AND rec_json->>'material_name' IS NOT NULL THEN 
            record_name := rec_json ->> 'material_name';
        ELSIF rec_json ? 'code' AND rec_json->>'code' IS NOT NULL THEN 
            record_name := rec_json ->> 'code';
        ELSIF rec_json ? 'sequence_number' AND rec_json->>'sequence_number' IS NOT NULL THEN 
            record_name := rec_json ->> 'sequence_number';
        ELSIF rec_json ? 'email' AND rec_json->>'email' IS NOT NULL THEN 
            record_name := rec_json ->> 'email';
        ELSIF rec_json ? 'description' AND rec_json->>'description' IS NOT NULL THEN 
            record_name := rec_json ->> 'description';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        record_name := '';
    END;

    -- Limitar longitud de record_name para evitar logs gigantescos
    IF length(record_name) > 60 THEN
        record_name := substring(record_name from 1 for 57) || '...';
    END IF;

    IF TG_OP = 'INSERT' THEN
        action_desc := 'Creó un registro en ' || table_name_es;
    ELSIF TG_OP = 'UPDATE' THEN
        IF new_status IS NOT NULL THEN
            action_desc := 'Cambio de estado a ' || new_status;
        ELSE
            action_desc := 'Actualizó un registro en ' || table_name_es;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        action_desc := 'Eliminó un registro de ' || table_name_es;
    END IF;

    IF record_name IS NOT NULL AND record_name != '' THEN
        action_desc := action_desc || ' (' || record_name || ')';
    END IF;

    -- Build details JSONB
    details_obj := jsonb_build_object(
        'table', TG_TABLE_NAME,
        'record_id', record_id,
        'description', action_desc
    );

    IF new_status IS NOT NULL THEN
        details_obj := details_obj || jsonb_build_object('new_status', new_status);
    END IF;

    -- Guardar datos antiguos para DELETE, nuevos para INSERT y ambos para UPDATE
    IF TG_OP = 'DELETE' THEN
        details_obj := details_obj || jsonb_build_object('old_data', rec_json);
    ELSIF TG_OP = 'INSERT' THEN
        details_obj := details_obj || jsonb_build_object('new_data', rec_json);
    ELSIF TG_OP = 'UPDATE' AND old_json IS NOT NULL THEN
        details_obj := details_obj || jsonb_build_object('old_data', old_json, 'new_data', rec_json);
    END IF;

    INSERT INTO public.audit_logs (action, user_email, details)
    VALUES (
        CASE TG_OP 
            WHEN 'INSERT' THEN 'Creación en ' || table_name_es
            WHEN 'UPDATE' THEN 'Actualización en ' || table_name_es
            WHEN 'DELETE' THEN 'Eliminación en ' || table_name_es
            ELSE TG_OP || ' ' || table_name_es
        END,
        user_email,
        details_obj
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Eliminar triggers existentes para evitar duplicidad
DROP TRIGGER IF EXISTS audit_companies ON public.companies;
DROP TRIGGER IF EXISTS audit_suppliers ON public.suppliers;
DROP TRIGGER IF EXISTS audit_materials ON public.materials;
DROP TRIGGER IF EXISTS audit_supplier_materials ON public.supplier_materials;
DROP TRIGGER IF EXISTS audit_quote_requests ON public.quote_requests;
DROP TRIGGER IF EXISTS audit_purchase_orders ON public.purchase_orders;
DROP TRIGGER IF EXISTS audit_service_orders ON public.service_orders;

DROP TRIGGER IF EXISTS audit_quote_request_items ON public.quote_request_items;
DROP TRIGGER IF EXISTS audit_purchase_order_items ON public.purchase_order_items;
DROP TRIGGER IF EXISTS audit_supplier_quotes ON public.supplier_quotes;
DROP TRIGGER IF EXISTS audit_quote_comparisons ON public.quote_comparisons;
DROP TRIGGER IF EXISTS audit_quote_comparison_items ON public.quote_comparison_items;
DROP TRIGGER IF EXISTS audit_service_order_items ON public.service_order_items;
DROP TRIGGER IF EXISTS audit_service_order_materials ON public.service_order_materials;
DROP TRIGGER IF EXISTS audit_material_categories ON public.material_categories;
DROP TRIGGER IF EXISTS audit_units_of_measure ON public.units_of_measure;
DROP TRIGGER IF EXISTS audit_fichas_tecnicas ON public.fichas_tecnicas;

-- 3. Crear triggers para cada tabla principal y de detalle
CREATE TRIGGER audit_companies AFTER INSERT OR UPDATE OR DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_materials AFTER INSERT OR UPDATE OR DELETE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_supplier_materials AFTER INSERT OR UPDATE OR DELETE ON public.supplier_materials FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_quote_requests AFTER INSERT OR UPDATE OR DELETE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_service_orders AFTER INSERT OR UPDATE OR DELETE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_quote_request_items AFTER INSERT OR UPDATE OR DELETE ON public.quote_request_items FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_purchase_order_items AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_supplier_quotes AFTER INSERT OR UPDATE OR DELETE ON public.supplier_quotes FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_quote_comparisons AFTER INSERT OR UPDATE OR DELETE ON public.quote_comparisons FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_quote_comparison_items AFTER INSERT OR UPDATE OR DELETE ON public.quote_comparison_items FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_service_order_items AFTER INSERT OR UPDATE OR DELETE ON public.service_order_items FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_service_order_materials AFTER INSERT OR UPDATE OR DELETE ON public.service_order_materials FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_material_categories AFTER INSERT OR UPDATE OR DELETE ON public.material_categories FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_units_of_measure AFTER INSERT OR UPDATE OR DELETE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_fichas_tecnicas AFTER INSERT OR UPDATE OR DELETE ON public.fichas_tecnicas FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
