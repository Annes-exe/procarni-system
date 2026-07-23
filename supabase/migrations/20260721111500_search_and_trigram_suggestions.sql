-- Migration: Update search_materials_by_substring and add search_master_materials_suggested

-- 1. Ensure pg_trgm extension is active
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Update search_materials_by_substring to allow searching all active and pending materials
CREATE OR REPLACE FUNCTION public.search_materials_by_substring(search_query text)
RETURNS SETOF public.materials
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT * FROM public.materials
    WHERE status IN ('active', 'pending')
       AND (
           name ILIKE '%' || search_query || '%'
           OR code ILIKE '%' || search_query || '%'
           OR EXISTS (
              SELECT 1 FROM unnest(search_aliases) alias 
              WHERE alias ILIKE '%' || search_query || '%'
           )
       )
    ORDER BY name ASC
    LIMIT 20;
END;
$function$;

-- 3. Create RPC search_master_materials_suggested with trigram similarity scoring
CREATE OR REPLACE FUNCTION public.search_master_materials_suggested(
    p_target_name text,
    p_search_query text DEFAULT '',
    p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name text,
    code text,
    category text,
    similarity_score double precision,
    is_suggested boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH scored_materials AS (
        SELECT 
            m.id,
            m.name,
            m.code,
            m.category,
            similarity(m.name, p_target_name)::double precision AS similarity_score
        FROM public.materials m
        WHERE m.is_master = true
          AND m.status = 'active'
          AND (p_exclude_id IS NULL OR m.id != p_exclude_id)
          AND (
              p_search_query IS NULL 
              OR p_search_query = '' 
              OR m.name ILIKE '%' || p_search_query || '%' 
              OR m.code ILIKE '%' || p_search_query || '%'
          )
    )
    SELECT 
        sm.id,
        sm.name,
        sm.code,
        sm.category,
        sm.similarity_score,
        (sm.similarity_score >= 0.15) AS is_suggested
    FROM scored_materials sm
    ORDER BY sm.similarity_score DESC, sm.name ASC;
END;
$$;

-- 4. DB Trigger to ensure that approved pending materials automatically become is_master = true if independent
CREATE OR REPLACE FUNCTION public.handle_material_approval_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' AND OLD.status = 'pending' AND NEW.base_material_id IS NULL THEN
        NEW.is_master := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_material_approval_status
    BEFORE UPDATE ON public.materials
    FOR EACH ROW
    WHEN (NEW.status = 'active' AND OLD.status = 'pending')
    EXECUTE FUNCTION public.handle_material_approval_trigger();

