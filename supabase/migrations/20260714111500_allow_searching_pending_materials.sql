-- Migration: Allow searching pending materials alongside active ones (System-wide cleanliness)
-- Author: Antigravity

CREATE OR REPLACE FUNCTION public.search_materials_by_substring(search_query text)
RETURNS SETOF public.materials AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.materials
    WHERE status IN ('active', 'pending')
       AND (
           is_master = true 
           OR status = 'pending' -- Allow searching new items that are still pending review
       )
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
