-- Migration: Material Fusion and Grouping
-- Add base_material_id and search_aliases columns
ALTER TABLE public.materials
ADD COLUMN base_material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
ADD COLUMN search_aliases text[] DEFAULT '{}'::text[];

-- Create RPC function for Material Fusion
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

        UPDATE public.quote_comparison_items SET material_id = p_target_material_id WHERE material_id = v_source_id;

        -- Update any base material references (if a group was pointing to this, point to the target)
        UPDATE public.materials SET base_material_id = p_target_material_id WHERE base_material_id = v_source_id;

        -- Delete the source material
        DELETE FROM public.materials WHERE id = v_source_id;

    END LOOP;

    -- De-duplicate and update aliases on target
    UPDATE public.materials 
    SET search_aliases = ARRAY(SELECT DISTINCT unnest(v_new_aliases))
    WHERE id = p_target_material_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC function for Advanced Material Searching (incorporating aliases)
CREATE OR REPLACE FUNCTION public.search_materials_by_substring(search_query text)
RETURNS SETOF public.materials AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.materials
    WHERE name ILIKE '%' || search_query || '%'
       OR code ILIKE '%' || search_query || '%'
       OR EXISTS (
          SELECT 1 FROM unnest(search_aliases) alias 
          WHERE alias ILIKE '%' || search_query || '%'
       )
    ORDER BY name ASC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
