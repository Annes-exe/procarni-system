-- Migración: Añadir soporte para múltiples ítems en purchase_reminders
-- Fecha: 2026-10-15

ALTER TABLE public.purchase_reminders
ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

-- Índice GIN para optimizar consultas sobre los ítems en formato JSONB
CREATE INDEX IF NOT EXISTS idx_purchase_reminders_items ON public.purchase_reminders USING GIN (items);

COMMENT ON COLUMN public.purchase_reminders.items IS 'Lista de múltiples materiales o insumos asociados al recordatorio de compra.';
