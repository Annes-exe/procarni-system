-- 1. Habilitar la extensión oficial de PostgreSQL para similitud de texto
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Crear la vista analítica en el esquema público para que tu frontend pueda consultarla
CREATE OR REPLACE VIEW public.vw_material_fusion_suggestions AS
SELECT 
    m1.id AS target_id,
    m1.name AS target_name,
    m2.id AS source_id,
    m2.name AS source_name,
    -- Multiplicamos por 100 para tener un porcentaje legible (Ej: 85.50%)
    ROUND((similarity(m1.name, m2.name) * 100)::numeric, 2) AS similarity_score
FROM 
    public.materials m1
JOIN 
    public.materials m2 ON m1.id < m2.id -- La condición < evita comparar A con A, o duplicar (A-B y B-A)
WHERE 
    -- Umbral de similitud: 0.4 significa un 40% de coincidencia. 
    -- Puedes subirlo a 0.5 si arroja demasiados falsos positivos.
    similarity(m1.name, m2.name) >= 0.4
ORDER BY 
    similarity_score DESC;

-- 3. Otorgar permisos para que el rol autenticado de Supabase pueda leer la vista
GRANT SELECT ON public.vw_material_fusion_suggestions TO authenticated;
