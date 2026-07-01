-- Migration: Unified Material Merge RPC
-- Target Database: hsspvhxneuetpatafdzy

-- 1. Añadimos columnas a public.materials
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS brand TEXT;

-- 2. Añadimos columna a public.supplier_materials
ALTER TABLE public.supplier_materials ADD COLUMN IF NOT EXISTS name_provided TEXT;

-- 3. Eliminar procedimientos anteriores obsoletos
DROP FUNCTION IF EXISTS public.merge_materials_with_alias(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.safe_link_to_master(uuid, uuid);

-- 4. Crear la función unificada merge_materials_unified
CREATE OR REPLACE FUNCTION public.merge_materials_unified(
    p_target_material_id uuid,
    p_source_material_ids uuid[]
)
RETURNS void AS $$
DECLARE
    v_source_id uuid;
    v_source_name text;
    v_source_aliases text[];
    v_new_aliases text[];
    v_supplier_id uuid;
BEGIN
    -- Verificar que el material de destino existe
    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE id = p_target_material_id) THEN
        RAISE EXCEPTION 'Target material not found';
    END IF;

    -- Inicializar los alias con los del material destino actual
    SELECT COALESCE(search_aliases, '{}'::text[]) INTO v_new_aliases
    FROM public.materials
    WHERE id = p_target_material_id;

    -- Iterar sobre cada uno de los materiales de origen
    FOREACH v_source_id IN ARRAY p_source_material_ids
    LOOP
        -- Evitar procesar el material destino si se incluyó en la lista
        IF v_source_id = p_target_material_id THEN
            CONTINUE;
        END IF;

        -- Obtener información básica del material origen
        SELECT name, COALESCE(search_aliases, '{}'::text[]) INTO v_source_name, v_source_aliases
        FROM public.materials
        WHERE id = v_source_id;

        -- Si no existe el registro de origen, omitirlo
        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        -- 1. Preservar el Nombre del Proveedor (Auto-descubrimiento a través de cotizaciones)
        SELECT supplier_id INTO v_supplier_id 
        FROM public.supplier_quotes 
        WHERE material_id = v_source_id 
        LIMIT 1;

        IF v_supplier_id IS NOT NULL THEN
            INSERT INTO public.supplier_materials (supplier_id, material_id, name_provided)
            VALUES (v_supplier_id, p_target_material_id, v_source_name)
            ON CONFLICT (supplier_id, material_id) DO UPDATE 
            SET name_provided = EXCLUDED.name_provided;
        END IF;

        -- 2. Agregar el nombre de origen a los alias acumulados si no existe
        IF v_source_name IS NOT NULL AND v_source_name != '' AND NOT (v_source_name = ANY(v_new_aliases)) THEN
            v_new_aliases := array_append(v_new_aliases, v_source_name);
        END IF;

        -- 3. Agregar los alias existentes del material de origen
        IF array_length(v_source_aliases, 1) > 0 THEN
            v_new_aliases := ARRAY(
                 SELECT DISTINCT unnest(array_cat(v_new_aliases, v_source_aliases))
            );
        END IF;

        -- 4. Actualizar claves foráneas en todas las tablas transaccionales y de cotizaciones
        UPDATE public.purchase_order_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.supplier_quotes SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.price_history SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.quote_request_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.service_order_materials SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.quote_comparison_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        
        -- supplier_materials (Evitar conflictos con UNIQUE(supplier_id, material_id))
        UPDATE public.supplier_materials sm1
        SET material_id = p_target_material_id
        WHERE material_id = v_source_id
        AND NOT EXISTS (
            SELECT 1 FROM public.supplier_materials sm2 
            WHERE sm2.material_id = p_target_material_id AND sm2.supplier_id = sm1.supplier_id
        );
        -- Eliminar duplicados remanentes en supplier_materials
        DELETE FROM public.supplier_materials WHERE material_id = v_source_id;

        -- Actualizar referencias de grupos jerárquicos (padres-hijos)
        UPDATE public.materials SET base_material_id = p_target_material_id WHERE base_material_id = v_source_id;

        -- 5. Soft-Delete (Archivar el material sucio/origen en lugar de eliminarlo físicamente)
        UPDATE public.materials 
        SET status = 'archived',
            base_material_id = p_target_material_id
        WHERE id = v_source_id;

    END LOOP;

    -- 6. De-duplicar y actualizar los alias consolidados en el material destino
    UPDATE public.materials 
    SET search_aliases = ARRAY(SELECT DISTINCT unnest(v_new_aliases))
    WHERE id = p_target_material_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Otorgar permisos de ejecución para usuarios autenticados
GRANT EXECUTE ON FUNCTION public.merge_materials_unified(uuid, uuid[]) TO authenticated;
