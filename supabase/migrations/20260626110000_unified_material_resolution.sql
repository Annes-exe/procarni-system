-- Migration: Resolución Unificada de Materiales (Fusión, Agrupación y Restauración)
-- Target Database: hsspvhxneuetpatafdzy

CREATE OR REPLACE FUNCTION public.resolve_materials_unified(
    p_action text,                      -- 'merge', 'group', o 'unmerge'
    p_target_material_id uuid,          -- El Patrón de Oro (Maestro/Destino)
    p_source_material_ids uuid[]        -- Los materiales de origen a procesar
)
RETURNS void AS $$
DECLARE
    v_source_id uuid;
    v_source_name text;
    v_target_name text;
    v_source_aliases text[];
    v_new_aliases text[];
BEGIN
    -- 1. Validaciones básicas
    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE id = p_target_material_id) THEN
        RAISE EXCEPTION 'Target material not found';
    END IF;
    SELECT name INTO v_target_name FROM public.materials WHERE id = p_target_material_id;

    -- 2. Bifurcación según la acción
    IF p_action = 'merge' THEN
        FOREACH v_source_id IN ARRAY p_source_material_ids
        LOOP
            IF v_source_id = p_target_material_id THEN
                CONTINUE;
            END IF;

            SELECT name, COALESCE(search_aliases, '{}'::text[]) INTO v_source_name, v_source_aliases
            FROM public.materials
            WHERE id = v_source_id;

            IF NOT FOUND THEN
                CONTINUE;
            END IF;

            -- Inicializar/obtener alias consolidados
            SELECT COALESCE(search_aliases, '{}'::text[]) INTO v_new_aliases
            FROM public.materials
            WHERE id = p_target_material_id;

            -- A. Asegurar relaciones en supplier_materials con name_provided para cotizaciones previas
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

            -- B. Copiar relaciones de catálogo existentes en supplier_materials al destino
            UPDATE public.supplier_materials target
            SET name_provided = v_source_name,
                specification = COALESCE(target.specification, source.specification)
            FROM public.supplier_materials source
            WHERE source.material_id = v_source_id
              AND target.material_id = p_target_material_id
              AND target.supplier_id = source.supplier_id
              AND (target.unit_id = source.unit_id OR (target.unit_id IS NULL AND source.unit_id IS NULL));

            -- C. Mover las relaciones de catálogo que no existían en el destino
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

            -- D. Eliminar las relaciones obsoletas del origen
            DELETE FROM public.supplier_materials WHERE material_id = v_source_id;

            -- E. Acumular alias
            IF v_source_name IS NOT NULL AND v_source_name != '' AND NOT (v_source_name = ANY(v_new_aliases)) THEN
                v_new_aliases := array_append(v_new_aliases, v_source_name);
            END IF;
            IF array_length(v_source_aliases, 1) > 0 THEN
                v_new_aliases := ARRAY(
                     SELECT DISTINCT unnest(array_cat(v_new_aliases, v_source_aliases))
                );
            END IF;

            -- F. Actualizar claves foráneas en tablas transaccionales
            UPDATE public.purchase_order_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
            UPDATE public.supplier_quotes SET material_id = p_target_material_id WHERE material_id = v_source_id;
            UPDATE public.price_history SET material_id = p_target_material_id WHERE material_id = v_source_id;
            UPDATE public.quote_request_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
            UPDATE public.service_order_materials SET material_id = p_target_material_id WHERE material_id = v_source_id;
            UPDATE public.quote_comparison_items SET material_id = p_target_material_id WHERE material_id = v_source_id;
            
            UPDATE public.materials SET base_material_id = p_target_material_id WHERE base_material_id = v_source_id;

            -- G. Soft-Delete (Archivar el material)
            UPDATE public.materials 
            SET status = 'archived',
                base_material_id = p_target_material_id
            WHERE id = v_source_id;

            -- Actualizar los alias de búsqueda en el destino
            UPDATE public.materials 
            SET search_aliases = ARRAY(SELECT DISTINCT unnest(v_new_aliases))
            WHERE id = p_target_material_id;

            -- Loggear auditoría de la fusión
            INSERT INTO public.audit_logs (action, details)
            VALUES (
                'FUSION',
                jsonb_build_object(
                    'table', 'materials', 
                    'record_id', v_source_id, 
                    'target_id', p_target_material_id,
                    'description', 'Material "' || v_source_name || '" fusionado (archivado) bajo el maestro "' || v_target_name || '"'
                )
            );
        END LOOP;

    ELSIF p_action = 'group' THEN
        -- Agrupación Jerárquica (Establecer como hijos del maestro sin borrarlos)
        FOREACH v_source_id IN ARRAY p_source_material_ids
        LOOP
            IF v_source_id = p_target_material_id THEN
                CONTINUE;
            END IF;
            SELECT name INTO v_source_name FROM public.materials WHERE id = v_source_id;

            -- Vincular como hijo del Patrón de Oro
            UPDATE public.materials 
            SET base_material_id = p_target_material_id 
            WHERE id = v_source_id;

            -- Loggear auditoría de la agrupación
            INSERT INTO public.audit_logs (action, details)
            VALUES (
                'GROUP_ADD',
                jsonb_build_object(
                    'table', 'materials', 
                    'record_id', v_source_id, 
                    'parent_id', p_target_material_id,
                    'description', 'Material "' || v_source_name || '" agrupado bajo "' || v_target_name || '"'
                )
            );
        END LOOP;

    ELSIF p_action = 'unmerge' THEN
        -- Reversión/Restauración de fusiones o agrupaciones
        FOREACH v_source_id IN ARRAY p_source_material_ids
        LOOP
            SELECT name INTO v_source_name FROM public.materials WHERE id = v_source_id;

            -- A. Activar de nuevo el material (quitar archivo)
            UPDATE public.materials 
            SET status = 'active', 
                base_material_id = NULL 
            WHERE id = v_source_id;

            -- B. Quitar su nombre de los alias de búsqueda del maestro
            UPDATE public.materials 
            SET search_aliases = array_remove(search_aliases, v_source_name)
            WHERE id = p_target_material_id;

            -- C. Registrar en auditoría que se deshizo la acción
            INSERT INTO public.audit_logs (action, details)
            VALUES (
                'UNMERGE',
                jsonb_build_object(
                    'table', 'materials', 
                    'record_id', v_source_id, 
                    'target_id', p_target_material_id,
                    'description', 'Fusión/Agrupación deshecha: Material "' || v_source_name || '" restaurado a estado activo'
                )
            );
        END LOOP;
    ELSE
        RAISE EXCEPTION 'Invalid action. Expected "merge", "group" or "unmerge"';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.resolve_materials_unified(text, uuid, uuid[]) TO authenticated;
