-- Tabla de Diccionario/Alias para sistemas externos
CREATE TABLE IF NOT EXISTS public.material_aliases (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id   UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  external_code TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.material_aliases IS 'Diccionario Just-in-Time para emparejar códigos del sistema de recetas con el catálogo local.';

-- Políticas de Seguridad (RLS)
ALTER TABLE public.material_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aliases_select" ON public.material_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "aliases_insert" ON public.material_aliases FOR INSERT TO authenticated WITH CHECK (true);
