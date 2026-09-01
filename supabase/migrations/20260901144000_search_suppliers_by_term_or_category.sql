-- Migration: 20260901144000_search_suppliers_by_term_or_category.sql
-- Description: Creates the high-performance RPC function search_suppliers_by_term_or_category
-- for omni-channel supplier search by material name, category, rubro, or supplier name/RIF.

-- Ensure pg_trgm and unaccent extensions are available
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- Drop previous version if exists
DROP FUNCTION IF EXISTS public.search_suppliers_by_term_or_category(text, text, text, integer);

CREATE OR REPLACE FUNCTION public.search_suppliers_by_term_or_category(
    p_search_term text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_city text DEFAULT NULL,
    p_limit int DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    name text,
    rif text,
    code text,
    city text,
    email text,
    phone text,
    phone_2 text,
    instagram text,
    payment_terms text,
    credit_days integer,
    status text,
    rubros text,
    total_materials bigint,
    matched_materials_sample text[],
    matched_categories text[],
    match_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_norm_term text;
    v_norm_cat text;
BEGIN
    v_norm_term := NULLIF(TRIM(p_search_term), '');
    v_norm_cat := NULLIF(TRIM(p_category), '');

    IF v_norm_term IS NOT NULL THEN
        v_norm_term := replace(lower(public.unaccent(v_norm_term)), '*', 'x');
    END IF;

    IF v_norm_cat IS NOT NULL THEN
        v_norm_cat := replace(lower(public.unaccent(v_norm_cat)), '*', 'x');
    END IF;

    RETURN QUERY
    WITH supplier_material_agg AS (
        SELECT 
            sm.supplier_id,
            COUNT(DISTINCT sm.material_id) AS sm_count,
            ARRAY_AGG(DISTINCT m.name) FILTER (
                WHERE (v_norm_term IS NOT NULL AND (
                    replace(lower(public.unaccent(m.name)), '*', 'x') ILIKE '%' || v_norm_term || '%'
                    OR replace(lower(public.unaccent(COALESCE(m.code, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%'
                    OR EXISTS (
                        SELECT 1 FROM unnest(m.search_aliases) alias
                        WHERE replace(lower(public.unaccent(alias)), '*', 'x') ILIKE '%' || v_norm_term || '%'
                    )
                ))
                OR (v_norm_term IS NULL AND v_norm_cat IS NOT NULL AND replace(lower(public.unaccent(COALESCE(m.category, ''))), '*', 'x') ILIKE '%' || v_norm_cat || '%')
            ) AS matching_mats,
            ARRAY_AGG(DISTINCT m.category) FILTER (
                WHERE (v_norm_cat IS NOT NULL AND replace(lower(public.unaccent(COALESCE(m.category, ''))), '*', 'x') ILIKE '%' || v_norm_cat || '%')
                   OR (v_norm_term IS NOT NULL AND replace(lower(public.unaccent(COALESCE(m.category, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%')
            ) AS matching_cats
        FROM public.supplier_materials sm
        JOIN public.materials m ON sm.material_id = m.id
        GROUP BY sm.supplier_id
    )
    SELECT 
        s.id,
        s.name::text,
        s.rif::text,
        s.code::text,
        s.city::text,
        s.email::text,
        s.phone::text,
        s.phone_2::text,
        s.instagram::text,
        s.payment_terms::text,
        s.credit_days,
        s.status::text,
        s.rubros::text,
        COALESCE(sma.sm_count, 0) AS total_materials,
        COALESCE(sma.matching_mats, ARRAY[]::text[]) AS matched_materials_sample,
        COALESCE(sma.matching_cats, ARRAY[]::text[]) AS matched_categories,
        CASE 
            WHEN v_norm_cat IS NOT NULL THEN 'categoria'
            WHEN v_norm_term IS NOT NULL AND replace(lower(public.unaccent(s.name)), '*', 'x') ILIKE '%' || v_norm_term || '%' THEN 'nombre'
            WHEN v_norm_term IS NOT NULL AND replace(lower(public.unaccent(COALESCE(s.rif, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%' THEN 'rif'
            WHEN v_norm_term IS NOT NULL AND replace(lower(public.unaccent(COALESCE(s.rubros, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%' THEN 'rubro'
            WHEN sma.matching_mats IS NOT NULL AND array_length(sma.matching_mats, 1) > 0 THEN 'material'
            WHEN sma.matching_cats IS NOT NULL AND array_length(sma.matching_cats, 1) > 0 THEN 'categoria'
            ELSE 'general'
        END AS match_type
    FROM public.suppliers s
    LEFT JOIN supplier_material_agg sma ON s.id = sma.supplier_id
    WHERE 
        s.status != 'Inactive'
        AND (p_city IS NULL OR p_city = 'all' OR s.city = p_city)
        AND (
            (v_norm_term IS NULL AND v_norm_cat IS NULL)
            OR (
                v_norm_cat IS NOT NULL AND (
                    (sma.matching_cats IS NOT NULL AND array_length(sma.matching_cats, 1) > 0)
                    OR (replace(lower(public.unaccent(COALESCE(s.rubros, ''))), '*', 'x') ILIKE '%' || v_norm_cat || '%')
                )
            )
            OR (
                v_norm_term IS NOT NULL AND (
                    replace(lower(public.unaccent(s.name)), '*', 'x') ILIKE '%' || v_norm_term || '%'
                    OR replace(lower(public.unaccent(COALESCE(s.rif, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%'
                    OR replace(lower(public.unaccent(COALESCE(s.code, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%'
                    OR replace(lower(public.unaccent(COALESCE(s.rubros, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%'
                    OR (sma.matching_mats IS NOT NULL AND array_length(sma.matching_mats, 1) > 0)
                    OR (sma.matching_cats IS NOT NULL AND array_length(sma.matching_cats, 1) > 0)
                    OR similarity(replace(lower(public.unaccent(s.name)), '*', 'x'), v_norm_term) > 0.25
                )
            )
        )
    ORDER BY 
        CASE 
            WHEN v_norm_term IS NOT NULL AND replace(lower(public.unaccent(s.name)), '*', 'x') ILIKE '%' || v_norm_term || '%' THEN 1
            WHEN sma.matching_mats IS NOT NULL AND array_length(sma.matching_mats, 1) > 0 THEN 2
            WHEN v_norm_cat IS NOT NULL OR (sma.matching_cats IS NOT NULL AND array_length(sma.matching_cats, 1) > 0) THEN 3
            WHEN v_norm_term IS NOT NULL AND replace(lower(public.unaccent(COALESCE(s.rubros, ''))), '*', 'x') ILIKE '%' || v_norm_term || '%' THEN 4
            ELSE 5
        END ASC,
        s.name ASC
    LIMIT p_limit;
END;
$$;

-- Grant execution permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.search_suppliers_by_term_or_category(text, text, text, integer) TO authenticated, anon, service_role;
