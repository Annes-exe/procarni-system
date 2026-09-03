-- Migration: Unified Supplier Merge RPC
-- Created at: 2026-09-03

CREATE OR REPLACE FUNCTION public.merge_suppliers_unified(
    p_target_supplier_id uuid,
    p_source_supplier_id uuid
)
RETURNS void AS $$
DECLARE
    v_source_name text;
    v_target_name text;
    v_source_record record;
    v_target_record record;
BEGIN
    -- 1. Validaciones básicas
    IF p_target_supplier_id IS NULL OR p_source_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Target and Source supplier IDs are required';
    END IF;

    IF p_target_supplier_id = p_source_supplier_id THEN
        RAISE EXCEPTION 'Cannot merge a supplier into itself';
    END IF;

    -- Verificar existencia de ambos proveedores
    SELECT * INTO v_target_record FROM public.suppliers WHERE id = p_target_supplier_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target supplier not found';
    END IF;
    v_target_name := v_target_record.name;

    SELECT * INTO v_source_record FROM public.suppliers WHERE id = p_source_supplier_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source supplier not found';
    END IF;
    v_source_name := v_source_record.name;

    -- 2. Re-vincular órdenes de compra
    UPDATE public.purchase_orders
    SET supplier_id = p_target_supplier_id
    WHERE supplier_id = p_source_supplier_id;

    -- 3. Re-vincular solicitudes de cotización
    UPDATE public.quote_requests
    SET supplier_id = p_target_supplier_id
    WHERE supplier_id = p_source_supplier_id;

    -- 4. Re-vincular órdenes de servicio y sus materiales
    UPDATE public.service_orders
    SET supplier_id = p_target_supplier_id
    WHERE supplier_id = p_source_supplier_id;

    UPDATE public.service_order_materials
    SET supplier_id = p_target_supplier_id
    WHERE supplier_id = p_source_supplier_id;

    -- 5. Re-vincular historial de precios
    UPDATE public.price_history
    SET supplier_id = p_target_supplier_id
    WHERE supplier_id = p_source_supplier_id;

    -- 6. Re-vincular fichas técnicas
    UPDATE public.fichas_tecnicas
    SET proveedor_id = p_target_supplier_id
    WHERE proveedor_id = p_source_supplier_id;

    -- 7. Re-vincular sedes (supplier_branches)
    UPDATE public.supplier_branches
    SET supplier_id = p_target_supplier_id
    WHERE supplier_id = p_source_supplier_id;

    -- 8. Re-vincular cotizaciones de proveedores (supplier_quotes)
    UPDATE public.supplier_quotes
    SET supplier_id = p_target_supplier_id
    WHERE supplier_id = p_source_supplier_id;

    -- 9. Re-vincular catálogo de materiales del proveedor (supplier_materials)
    -- Migrar materiales que el destino NO tenga registrados
    UPDATE public.supplier_materials sm1
    SET supplier_id = p_target_supplier_id
    WHERE sm1.supplier_id = p_source_supplier_id
    AND NOT EXISTS (
        SELECT 1 FROM public.supplier_materials sm2
        WHERE sm2.supplier_id = p_target_supplier_id
        AND sm2.material_id = sm1.material_id
        AND (sm2.unit_id IS NOT DISTINCT FROM sm1.unit_id)
    );

    -- Eliminar asociaciones duplicadas remanentes del origen
    DELETE FROM public.supplier_materials
    WHERE supplier_id = p_source_supplier_id;

    -- 10. Completar datos de contacto faltantes en el destino si el origen los tiene
    UPDATE public.suppliers
    SET
        phone = COALESCE(NULLIF(v_target_record.phone, ''), v_source_record.phone),
        phone_2 = COALESCE(NULLIF(v_target_record.phone_2, ''), v_source_record.phone_2),
        email = COALESCE(NULLIF(v_target_record.email, ''), v_source_record.email),
        instagram = COALESCE(NULLIF(v_target_record.instagram, ''), v_source_record.instagram),
        address = COALESCE(NULLIF(v_target_record.address, ''), v_source_record.address),
        city = COALESCE(NULLIF(v_target_record.city, ''), v_source_record.city),
        website = COALESCE(NULLIF(v_target_record.website, ''), v_source_record.website),
        rubros = COALESCE(NULLIF(v_target_record.rubros, ''), v_source_record.rubros),
        is_raw_material = COALESCE(v_target_record.is_raw_material, v_source_record.is_raw_material),
        updated_at = now()
    WHERE id = p_target_supplier_id;

    -- 11. Soft-Archive del proveedor de origen
    UPDATE public.suppliers
    SET
        status = 'Inactive',
        alert_comment = CASE 
            WHEN alert_comment IS NOT NULL AND alert_comment <> '' 
            THEN alert_comment || ' | [FUSIONADO con: ' || v_target_name || ']'
            ELSE '[FUSIONADO con: ' || v_target_name || ']'
        END,
        updated_at = now()
    WHERE id = p_source_supplier_id;

    -- 12. Registro de auditoría
    INSERT INTO public.audit_logs (
        action,
        details,
        timestamp
    ) VALUES (
        'MERGE_SUPPLIERS',
        jsonb_build_object(
            'source_supplier_id', p_source_supplier_id,
            'source_supplier_name', v_source_name,
            'target_supplier_id', p_target_supplier_id,
            'target_supplier_name', v_target_name,
            'description', 'Fusión de proveedor ' || v_source_name || ' hacia ' || v_target_name
        ),
        now()
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permiso para usuarios autenticados
GRANT EXECUTE ON FUNCTION public.merge_suppliers_unified(uuid, uuid) TO authenticated;
