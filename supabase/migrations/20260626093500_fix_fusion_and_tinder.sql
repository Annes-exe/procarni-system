-- Migration: Correcciones de Fusión y Tinder Mapper
-- Target Database: hsspvhxneuetpatafdzy

-- 1. Modificar la vista de sugerencias para filtrar materiales inactivos/archivados
CREATE OR REPLACE VIEW public.vw_material_fusion_suggestions AS
SELECT 
    m1.id AS target_id,
    m1.name AS target_name,
    m2.id AS source_id,
    m2.name AS source_name,
    ROUND((similarity(m1.name, m2.name) * 100)::numeric, 2) AS similarity_score
FROM 
    public.materials m1
JOIN 
    public.materials m2 ON m1.id < m2.id
LEFT JOIN
    public.ignored_material_matches i ON 
    (m1.id = i.target_id AND m2.id = i.source_id) OR 
    (m1.id = i.source_id AND m2.id = i.target_id)
WHERE 
    m1.status = 'active'
    AND m2.status = 'active'
    AND similarity(m1.name, m2.name) >= 0.4
    AND i.id IS NULL
ORDER BY 
    similarity_score DESC;

-- 2. Redefinir la función merge_materials_unified para corregir el guardado de name_provided
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

        -- 1. Asegurar que los proveedores con cotizaciones previas tengan la relación en supplier_materials con name_provided
        INSERT INTO public.supplier_materials (supplier_id, material_id, name_provided, unit_id, user_id)
        SELECT DISTINCT 
            sq.supplier_id, 
            p_target_material_id, 
            v_source_name,
            sq.unit_id,
            sq.user_id
        FROM public.supplier_quotes sq
        WHERE sq.material_id = v_source_id
        ON CONFLICT (supplier_id, material_id, unit_id) DO UPDATE 
        SET name_provided = EXCLUDED.name_provided;

        -- 2. Para las relaciones que ya existen en el destino (mismo proveedor y unidad):
        -- Actualizar el name_provided al del origen.
        UPDATE public.supplier_materials target
        SET name_provided = v_source_name,
            specification = COALESCE(target.specification, source.specification)
        FROM public.supplier_materials source
        WHERE source.material_id = v_source_id
          AND target.material_id = p_target_material_id
          AND target.supplier_id = source.supplier_id
          AND (target.unit_id = source.unit_id OR (target.unit_id IS NULL AND source.unit_id IS NULL));

        -- 3. Para las relaciones del origen que NO existen en el destino:
        -- Moverlas al destino y colocar el name_provided.
        UPDATE public.supplier_materials source
        SET material_id = p_target_material_id,
            name_provided = v_source_name
        WHERE source.material_id = v_source_id
          AND NOT EXISTS (
              SELECT 1 
              FROM public.supplier_materials target
              WHERE target.material_id = p_target_material_id
                AND target.supplier_id = source.supplier_id
                AND (target.unit_id = source.unit_id OR (target.unit_id IS NULL AND source.unit_id IS NULL))
          );

        -- 4. Eliminar las relaciones obsoletas del origen
        DELETE FROM public.supplier_materials WHERE material_id = v_source_id;

        -- 4. Agregar el nombre de origen a los alias acumulados si no existe
        IF v_source_name IS NOT NULL AND v_source_name != '' AND NOT (v_source_name = ANY(v_new_aliases)) THEN
            v_new_aliases := array_append(v_new_aliases, v_source_name);
        END IF;

        -- 5. Agregar los alias existentes del material de origen
        IF array_length(v_source_aliases, 1) > 0 THEN
            v_new_aliases := ARRAY(
                 SELECT DISTINCT unnest(array_cat(v_new_aliases, v_source_aliases))
            );
        END IF;

        -- 6. Actualizar claves foráneas en todas las tablas transaccionales y de cotizaciones
        UPDATE public.purchase_order_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.supplier_quotes SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.price_history SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.quote_request_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.service_order_materials SET material_id = p_target_material_id WHERE material_id = v_source_id;
        UPDATE public.quote_comparison_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
        
        -- Actualizar referencias de grupos jerárquicos (padres-hijos)
        UPDATE public.materials SET base_material_id = p_target_material_id WHERE base_material_id = v_source_id;

        -- 7. Soft-Delete (Archivar el material de origen en lugar de eliminarlo físicamente)
        UPDATE public.materials 
        SET status = 'archived',
            base_material_id = p_target_material_id
        WHERE id = v_source_id;

    END LOOP;

    -- 8. De-duplicar y actualizar los alias consolidados en el material destino
    UPDATE public.materials 
    SET search_aliases = ARRAY(SELECT DISTINCT unnest(v_new_aliases))
    WHERE id = p_target_material_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.merge_materials_unified(uuid, uuid[]) TO authenticated;
