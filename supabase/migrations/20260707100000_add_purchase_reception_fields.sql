-- Migration: Add purchase reception tracking fields
-- Created at: 2026-07-07

-- Alter purchase_orders to add reception_status
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS reception_status TEXT DEFAULT 'Ninguno';

-- Add check constraint for reception_status
ALTER TABLE public.purchase_orders 
DROP CONSTRAINT IF EXISTS purchase_orders_reception_status_check;

ALTER TABLE public.purchase_orders 
ADD CONSTRAINT purchase_orders_reception_status_check 
CHECK (reception_status = ANY (ARRAY['Ninguno'::text, 'En tránsito'::text, 'Parcial'::text, 'Recibido'::text]));

-- Alter purchase_order_items to add received_quantity
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0.0;

-- Add check constraint for received_quantity to be non-negative
ALTER TABLE public.purchase_order_items 
DROP CONSTRAINT IF EXISTS purchase_order_items_received_quantity_check;

ALTER TABLE public.purchase_order_items 
ADD CONSTRAINT purchase_order_items_received_quantity_check 
CHECK (received_quantity >= 0);
