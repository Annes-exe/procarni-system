-- Migration: Unificar Fusión y Saneamiento de Materiales (Soft-Delete)
-- Target Database: hsspvhxneuetpatafdzy

-- 1. Añadimos columnas a public.materials
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS brand TEXT;

-- 2. Añadimos columna a public.supplier_materials
ALTER TABLE public.supplier_materials ADD COLUMN IF NOT EXISTS name_provided TEXT;

-- 3. Modificar la función merge_materials_with_alias para que sea un Soft-Delete (Archive)
CREATE OR REPLACE FUNCTION public.merge_materials_with_alias(
    p_target_material_id uuid,
    p_source_material_ids uuid[]
)
RETURNS void AS $$
DECLARE
    v_source_id uuid;
    v_source_name text;
    v_source_aliases text[];
    v_new_aliases text[];
BEGIN
    -- Verify target exists
    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE id = p_target_material_id) THEN
        RAISE EXCEPTION 'Target material not found';
    END IF;

    -- Initialize aliases with current target aliases
    SELECT COALESCE(search_aliases, '{}'::text[]) INTO v_new_aliases
    FROM public.materials
    WHERE id = p_target_material_id;

    -- Iterate over source materials
    FOREACH v_source_id IN ARRAY p_source_material_ids
    LOOP
        -- Avoid merging into itself
        IF v_source_id = p_target_material_id THEN
            CONTINUE;
        END IF;

        -- Get source material info
        SELECT name, COALESCE(search_aliases, '{}'::text[]) INTO v_source_name, v_source_aliases
        FROM public.materials
        WHERE id = v_source_id;

        -- If not found, skip
        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        -- Add source name to aliases if not already present
        IF v_source_name IS NOT NULL AND v_source_name != '' AND NOT (v_source_name = ANY(v_new_aliases)) THEN
            v_new_aliases := array_append(v_new_aliases, v_source_name);
        END IF;

        -- Add existing aliases of the source
        IF array_length(v_source_aliases, 1) > 0 THEN
            v_new_aliases := ARRAY(
                 SELECT DISTINCT unnest(array_cat(v_new_aliases, v_source_aliases))
            );
        END IF;

        -- Update Foreign Keys across all related tables
        UPDATE public.purchase_order_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.supplier_quotes SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.price_history SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.quote_request_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.service_order_materials SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.quote_comparison_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        
        -- supplier_materials (Handling UNIQUE constraint on supplier_id, material_id)
        UPDATE public.supplier_materials sm1
        SET material_id = p_target_material_id
        WHERE material_id = v_source_id
        AND NOT EXISTS (
            SELECT 1 FROM public.supplier_materials sm2 
            WHERE sm2.material_id = p_target_material_id AND sm2.supplier_id = sm1.supplier_id
        );
        -- Delete any remaining that couldn't be updated due to duplicates
        DELETE FROM public.supplier_materials WHERE material_id = v_source_id;

        -- Update any base material references (if a group was pointing to this, point to the target)
        UPDATE public.materials SET base_material_id = p_target_material_id WHERE base_material_id = v_source_id;

        -- Ocultamos el material en lugar de borrarlo
        UPDATE public.materials 
        SET status = 'archived',
            base_material_id = p_target_material_id
        WHERE id = v_source_id;

    END LOOP;

    -- De-duplicate and update aliases on target
    UPDATE public.materials 
    SET search_aliases = ARRAY(SELECT DISTINCT unnest(v_new_aliases))
    WHERE id = p_target_material_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Modificar la función safe_link_to_master para adaptarse a las nuevas columnas
CREATE OR REPLACE FUNCTION public.safe_link_to_master(
    p_master_id uuid,  -- El ID del material oficial (Patrón Oro)
    p_dirty_id uuid    -- El ID del material sucio/duplicado
)
RETURNS void AS $$
DECLARE
    v_dirty_name text;
    v_supplier_id uuid;
BEGIN
    -- 1. Obtenemos el nombre sucio
    SELECT name INTO v_dirty_name FROM public.materials WHERE id = p_dirty_id;

    -- 2. Buscamos de qué proveedor venía este material sucio
    SELECT supplier_id INTO v_supplier_id FROM public.supplier_quotes WHERE material_id = p_dirty_id LIMIT 1;

    -- 3. Guardamos "cómo lo llama el proveedor" en name_provided de supplier_materials
    IF v_supplier_id IS NOT NULL THEN
        INSERT INTO public.supplier_materials (supplier_id, material_id, name_provided)
        VALUES (v_supplier_id, p_master_id, v_dirty_name)
        ON CONFLICT (supplier_id, material_id) DO UPDATE 
        SET name_provided = v_dirty_name;
    END IF;

    -- 4. Reasignamos el historial (Órdenes, Precios, Cotizaciones) para que apunten al Maestro
    UPDATE public.purchase_order_items SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.price_history SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.supplier_quotes SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.service_order_materials SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.quote_request_items SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.quote_comparison_items SET material_id = p_master_id WHERE material_id = p_dirty_id;
    
    -- 5. Agregamos el nombre sucio a los alias de búsqueda del maestro
    UPDATE public.materials 
    SET search_aliases = array_append(COALESCE(search_aliases, '{}'::text[]), v_dirty_name)
    WHERE id = p_master_id 
      AND NOT (v_dirty_name = ANY(COALESCE(search_aliases, '{}'::text[])));

    -- 6. En lugar de borrarlo, lo ocultamos y guardamos a dónde fue a parar
    UPDATE public.materials 
    SET status = 'archived', 
        base_material_id = p_master_id
    WHERE id = p_dirty_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
