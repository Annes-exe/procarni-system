-- 1. Crear la tabla de ignorados
CREATE TABLE public.ignored_material_matches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    target_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    source_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Para evitar duplicados independientemente del orden
    CONSTRAINT unique_ignored_match UNIQUE (target_id, source_id)
);

-- 2. Configurar Row Level Security (RLS)
ALTER TABLE public.ignored_material_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users on ignored_material_matches" 
ON public.ignored_material_matches FOR ALL 
USING (auth.role() = 'authenticated');

-- 3. Modificar la vista existente para excluir los registros ignorados
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
    similarity(m1.name, m2.name) >= 0.4
    AND i.id IS NULL -- Clave: filtramos los que tengan un registro en la tabla de ignorados
ORDER BY 
    similarity_score DESC;
