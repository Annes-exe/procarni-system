-- Migration: Crear tabla y políticas para Recordatorios y Tareas Programadas de Compras
-- Fecha: 2026-10-05

CREATE TABLE IF NOT EXISTS public.purchase_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    reminder_type TEXT NOT NULL DEFAULT 'material_purchase' CHECK (reminder_type IN ('material_purchase', 'management_task')),
    priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja', 'media', 'alta', 'urgente')),
    due_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
    material_name TEXT,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    quantity NUMERIC DEFAULT 1,
    unit_id UUID REFERENCES public.units_of_measure(id) ON DELETE SET NULL,
    unit_name TEXT,
    estimated_price NUMERIC,
    currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'VES', 'EUR')),
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_interval TEXT CHECK (recurrence_interval IS NULL OR recurrence_interval IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
    recurrence_days INTEGER,
    last_completed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para optimizar consultas por usuario, estado, fecha y recurrencia
CREATE INDEX IF NOT EXISTS idx_purchase_reminders_user_id ON public.purchase_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_reminders_status ON public.purchase_reminders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_reminders_due_date ON public.purchase_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_purchase_reminders_recurring ON public.purchase_reminders(is_recurring);
CREATE INDEX IF NOT EXISTS idx_purchase_reminders_po_id ON public.purchase_reminders(purchase_order_id);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.purchase_reminders ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'purchase_reminders' AND policyname = 'Users can manage their own purchase reminders'
    ) THEN
        CREATE POLICY "Users can manage their own purchase reminders"
        ON public.purchase_reminders
        FOR ALL
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

COMMENT ON TABLE public.purchase_reminders IS 'Control de recordatorios personalizados de compras y tareas operativas programadas recurrentes.';
