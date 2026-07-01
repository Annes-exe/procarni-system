-- 1. Añadimos una bandera para saber cuáles son los oficiales (el Patrón Oro)
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- 2. Añadimos un estado para no borrar nada, solo ocultarlo
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'pending'));

-- 3. Función Segura de Vinculación
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

    -- 2. Buscamos de qué proveedor venía este material sucio (buscando en el historial de cotizaciones)
    SELECT supplier_id INTO v_supplier_id FROM public.supplier_quotes WHERE material_id = p_dirty_id LIMIT 1;

    -- 3. Guardamos "cómo lo llama el proveedor" en la tabla puente (alias)
    IF v_supplier_id IS NOT NULL THEN
        INSERT INTO public.supplier_materials (supplier_id, material_id, specification)
        VALUES (v_supplier_id, p_master_id, v_dirty_name)
        ON CONFLICT (supplier_id, material_id) DO UPDATE 
        SET specification = v_dirty_name;
    END IF;

    -- 4. Reasignamos el historial (Órdenes, Precios, Cotizaciones) para que apunten al Maestro
    UPDATE public.purchase_order_items SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.price_history SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.supplier_quotes SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.service_order_materials SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.quote_request_items SET material_id = p_master_id WHERE material_id = p_dirty_id;
    UPDATE public.quote_comparison_items SET material_id = p_master_id WHERE material_id = p_dirty_id;
    
    -- 5. En lugar de borrarlo, lo ocultamos y guardamos a dónde fue a parar
    UPDATE public.materials 
    SET status = 'archived', 
        base_material_id = p_master_id
    WHERE id = p_dirty_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Actualizar función de búsqueda RPC para respetar el filtro de visibilidad
CREATE OR REPLACE FUNCTION public.search_materials_by_substring(search_query text)
RETURNS SETOF public.materials AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.materials
    WHERE status = 'active'
       AND (
           is_master = true 
           OR category NOT IN ('SECA', 'FRESCA', 'EMPAQUE')
           OR category IS NULL
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

-- 5. Vista de sugerencias para Soft-Migration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE VIEW public.vw_soft_migration_suggestions AS
SELECT 
    m1.id AS master_id,
    m1.name AS master_name,
    m2.id AS dirty_id,
    m2.name AS dirty_name,
    m2.category AS dirty_category,
    m2.unit AS dirty_unit,
    ROUND((similarity(m1.name, m2.name) * 100)::numeric, 2) AS similarity_score
FROM 
    public.materials m1
JOIN 
    public.materials m2 ON m1.id != m2.id
WHERE 
    m1.is_master = true 
    AND m2.is_master = false 
    AND m2.status = 'active'
    AND m2.category IN ('SECA', 'FRESCA', 'EMPAQUE')
    AND similarity(m1.name, m2.name) >= 0.3
ORDER BY 
    similarity_score DESC;

GRANT SELECT ON public.vw_soft_migration_suggestions TO authenticated;
