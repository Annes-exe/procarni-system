-- Migration: Exclude already grouped materials from suggestions views
-- Target Database: hsspvhxneuetpatafdzy

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
    public.materials m2 ON m1.id != m2.id
LEFT JOIN
    public.ignored_material_matches i ON 
    (m1.id = i.target_id AND m2.id = i.source_id) OR 
    (m1.id = i.source_id AND m2.id = i.target_id)
WHERE 
    m1.status = 'active'
    AND m2.status = 'active'
    AND m1.is_master = true
    AND m2.is_master = false
    AND m2.base_material_id IS NULL
    AND similarity(m1.name, m2.name) >= 0.4
    AND i.id IS NULL
ORDER BY 
    similarity_score DESC;

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
    AND m2.base_material_id IS NULL
    AND m2.category IN ('SECA', 'FRESCA', 'EMPAQUE')
    AND similarity(m1.name, m2.name) >= 0.3
ORDER BY 
    similarity_score DESC;
