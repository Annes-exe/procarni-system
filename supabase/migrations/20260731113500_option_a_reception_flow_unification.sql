-- Migration: Option A Reception Flow Unification & Category Rules Documentation
-- Created at: 2026-07-31

-- 1. Ensure reception status check constraint on purchase_orders
ALTER TABLE public.purchase_orders 
DROP CONSTRAINT IF EXISTS purchase_orders_reception_status_check;

ALTER TABLE public.purchase_orders 
ADD CONSTRAINT purchase_orders_reception_status_check 
CHECK (reception_status = ANY (ARRAY['Ninguno'::text, 'En tránsito'::text, 'Parcial'::text, 'Recibido'::text]));

-- 2. Ensure received_quantity non-negative and max bounds on purchase_order_items
ALTER TABLE public.purchase_order_items 
DROP CONSTRAINT IF EXISTS purchase_order_items_received_quantity_check;

ALTER TABLE public.purchase_order_items 
ADD CONSTRAINT purchase_order_items_received_quantity_check 
CHECK (received_quantity >= 0);

-- 3. Document Category Restrictions comment
COMMENT ON COLUMN public.materials_inventory.inventory_category IS 'Categorías de Almacén: MPF (Materia Prima Fresca), MPS (Materia Prima Seca), EMP (Empaques), ETQ (Etiquetas). Se aplican ajustes de merma avanzados para MPF/MPS y opción de habilitación directa para MPF/MPS/EMP.';

-- 4. Ensure document_number column exists in order_documents for multi-order invoice tracking
ALTER TABLE public.order_documents 
ADD COLUMN IF NOT EXISTS document_number TEXT;
