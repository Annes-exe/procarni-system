-- Migration: Unified Supplier Merge RPC
-- Created at: 2026-09-03
-- Updated: RIF precedence logic and safe transfer

CREATE OR REPLACE FUNCTION public.merge_suppliers_unified(
    p_target_supplier_id uuid,
    p_source_supplier_id uuid
)
RETURNS void AS $$
DECLARE
    v_source_name text;
    v_target_name text;
    v_source_rif text;
    v_target_rif text;
    v_final_target_rif text;
    v_target_is_generic boolean;
    v_source_is_generic boolean;
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
    v_target_rif := v_target_record.rif;

    SELECT * INTO v_source_record FROM public.suppliers WHERE id = p_source_supplier_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source supplier not found';
    END IF;
    v_source_name := v_source_record.name;
    v_source_rif := v_source_record.rif;

    -- Evaluar si los RIFs son genéricos/placeholder ('SR' o 'J000000%')
    v_target_is_generic := (v_target_rif IS NULL OR TRIM(v_target_rif) = '' OR v_target_rif ILIKE 'SR%' OR v_target_rif ILIKE 'J000000%');
    v_source_is_generic := (v_source_rif IS NULL OR TRIM(v_source_rif) = '' OR v_source_rif ILIKE 'SR%' OR v_source_rif ILIKE 'J000000%');

    -- Determinar RIF final del proveedor destino:
    -- Si el destino tiene RIF placeholder 'SR' y el origen tiene un RIF real, se adopta el del origen.
    -- En cualquier otro caso (si ambos tienen real o ambos son genéricos), prevalece el del destino.
    IF v_target_is_generic AND NOT v_source_is_generic THEN
        v_final_target_rif := v_source_rif;
    ELSE
        v_final_target_rif := v_target_rif;
    END IF;

    -- Liberar el RIF del proveedor origen para evitar violación de UNIQUE constraint
    UPDATE public.suppliers
    SET rif = 'SR_ARCHIVED_' || substring(p_source_supplier_id::text from 1 for 8) || '_' || floor(extract(epoch from now()))::text
    WHERE id = p_source_supplier_id;

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

    -- 10. Completar datos de contacto y RIF en el destino
    UPDATE public.suppliers
    SET
        rif = v_final_target_rif,
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
            'source_supplier_rif', v_source_rif,
            'target_supplier_id', p_target_supplier_id,
            'target_supplier_name', v_target_name,
            'final_target_rif', v_final_target_rif,
            'description', 'Fusión de proveedor ' || v_source_name || ' hacia ' || v_target_name
        ),
        now()
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.merge_suppliers_unified(uuid, uuid) TO authenticated;
