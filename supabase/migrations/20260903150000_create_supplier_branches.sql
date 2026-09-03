-- Migration: Create supplier_branches table
-- Permite registrar múltiples sedes por proveedor con dirección, ubicación geográfica y datos de contacto directo.

CREATE TABLE IF NOT EXISTS public.supplier_branches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    state TEXT,
    city TEXT,
    phone TEXT,
    phone_2 TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices de búsqueda y optimización
CREATE INDEX IF NOT EXISTS idx_supplier_branches_supplier_id ON public.supplier_branches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_branches_state_city ON public.supplier_branches(state, city);
CREATE INDEX IF NOT EXISTS idx_supplier_branches_status ON public.supplier_branches(status);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.supplier_branches ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para usuarios autenticados
CREATE POLICY "supplier_branches_select_policy"
    ON public.supplier_branches FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "supplier_branches_insert_policy"
    ON public.supplier_branches FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "supplier_branches_update_policy"
    ON public.supplier_branches FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "supplier_branches_delete_policy"
    ON public.supplier_branches FOR DELETE
    USING (auth.role() = 'authenticated');

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_supplier_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_branches_updated_at ON public.supplier_branches;
CREATE TRIGGER trg_supplier_branches_updated_at
    BEFORE UPDATE ON public.supplier_branches
    FOR EACH ROW
    EXECUTE FUNCTION update_supplier_branches_updated_at();
