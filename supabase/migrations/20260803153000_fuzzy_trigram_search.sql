-- Migration: Fuzzy Search with Accent Insensitivity and Asterisk/X equivalency
-- Date: 2026-08-03

-- 1. Ensure unaccent extension is enabled in the public schema
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- 2. Update search_materials_by_substring function with fuzzy trigram matching and normalization
CREATE OR REPLACE FUNCTION public.search_materials_by_substring(search_query text)
RETURNS SETOF public.materials
LANGUAGE plpgsql
AS $function$
DECLARE
    normalized_query text;
BEGIN
    -- Normalize query: lowercase, remove accents, and replace asterisk (*) with letter (x)
    normalized_query := replace(lower(public.unaccent(search_query)), '*', 'x');

    RETURN QUERY
    SELECT m.* FROM public.materials m
    WHERE m.status IN ('active', 'pending')
       AND (
           -- A. Exact / Substring matches on normalized name or code
           replace(lower(public.unaccent(m.name)), '*', 'x') ILIKE '%' || normalized_query || '%'
           OR replace(lower(public.unaccent(m.code)), '*', 'x') ILIKE '%' || normalized_query || '%'
           -- B. Trigram similarity matches on name or code for typo tolerance
           -- Threshold of 0.25 is perfect for matching names with typos
           -- Since pg_trgm similarity works on whole strings, we compare normalized versions
           OR similarity(replace(lower(public.unaccent(m.name)), '*', 'x'), normalized_query) > 0.25
           OR similarity(replace(lower(public.unaccent(m.code)), '*', 'x'), normalized_query) > 0.25
           -- C. Matches on aliases
           OR EXISTS (
              SELECT 1 FROM unnest(m.search_aliases) alias 
              WHERE replace(lower(public.unaccent(alias)), '*', 'x') ILIKE '%' || normalized_query || '%'
                 OR similarity(replace(lower(public.unaccent(alias)), '*', 'x'), normalized_query) > 0.25
           )
       )
    ORDER BY 
       -- Exact matches or prefixes first, then similarity level, then alphabetical order
       CASE 
         WHEN replace(lower(public.unaccent(m.name)), '*', 'x') = normalized_query THEN 0
         WHEN replace(lower(public.unaccent(m.name)), '*', 'x') ILIKE normalized_query || '%' THEN 1
         ELSE 2
       END ASC,
       similarity(replace(lower(public.unaccent(m.name)), '*', 'x'), normalized_query) DESC,
       m.name ASC
    LIMIT 150;
END;
$function$;
