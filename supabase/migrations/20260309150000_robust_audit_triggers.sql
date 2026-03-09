-- 1. Crear función genérica de auditoría
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
        WHEN 'purchase_orders' THEN table_name_es := 'Órdenes de Compra';
        WHEN 'service_orders' THEN table_name_es := 'Órdenes de Servicio';
        WHEN 'profiles' THEN table_name_es := 'Usuarios';
        ELSE table_name_es := TG_TABLE_NAME;
    END CASE;

    IF TG_OP = 'DELETE' THEN
        rec := OLD;
    ELSE
        rec := NEW;
    END IF;

    -- Safely get ID (some tables might not have an id field, but most do)
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

    -- Extraer nombre representativo si existe en el JSONB del registro
    BEGIN
        IF rec_json ? 'name' AND rec_json->>'name' IS NOT NULL THEN 
            record_name := rec_json ->> 'name';
        ELSIF rec_json ? 'code' AND rec_json->>'code' IS NOT NULL THEN 
            record_name := rec_json ->> 'code';
        ELSIF rec_json ? 'sequence_number' AND rec_json->>'sequence_number' IS NOT NULL THEN 
            record_name := rec_json ->> 'sequence_number';
        ELSIF rec_json ? 'email' AND rec_json->>'email' IS NOT NULL THEN 
            record_name := rec_json ->> 'email';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        record_name := '';
    END;

    IF TG_OP = 'INSERT' THEN
        action_desc := 'Creó un registro en ' || table_name_es;
    ELSIF TG_OP = 'UPDATE' THEN
        action_desc := 'Actualizó un registro en ' || table_name_es;
    ELSIF TG_OP = 'DELETE' THEN
        action_desc := 'Eliminó un registro de ' || table_name_es;
    END IF;

    IF record_name IS NOT NULL AND record_name != '' THEN
        action_desc := action_desc || ' (' || record_name || ')';
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
        jsonb_build_object(
            'table', TG_TABLE_NAME,
            'record_id', record_id,
            'description', action_desc
        )
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Eliminar triggers existentes si los hay para evitar duplicidad
DROP TRIGGER IF EXISTS audit_companies ON public.companies;
DROP TRIGGER IF EXISTS audit_suppliers ON public.suppliers;
DROP TRIGGER IF EXISTS audit_materials ON public.materials;
DROP TRIGGER IF EXISTS audit_supplier_materials ON public.supplier_materials;
DROP TRIGGER IF EXISTS audit_quote_requests ON public.quote_requests;
DROP TRIGGER IF EXISTS audit_purchase_orders ON public.purchase_orders;
DROP TRIGGER IF EXISTS audit_service_orders ON public.service_orders;

-- 3. Crear triggers para cada tabla principal
CREATE TRIGGER audit_companies AFTER INSERT OR UPDATE OR DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_materials AFTER INSERT OR UPDATE OR DELETE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_supplier_materials AFTER INSERT OR UPDATE OR DELETE ON public.supplier_materials FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_quote_requests AFTER INSERT OR UPDATE OR DELETE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_service_orders AFTER INSERT OR UPDATE OR DELETE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
