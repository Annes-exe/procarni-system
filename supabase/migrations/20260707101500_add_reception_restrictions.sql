-- Migration: Add reception restrictions
-- Created at: 2026-07-07

-- 1. Constraint: Cannot receive more than the requested quantity
ALTER TABLE public.purchase_order_items 
DROP CONSTRAINT IF EXISTS purchase_order_items_received_qty_max;

ALTER TABLE public.purchase_order_items 
ADD CONSTRAINT purchase_order_items_received_qty_max 
CHECK (received_quantity <= quantity);

-- 2. Constraint: Only approved/credit/paid/topay/received orders can be in transit/received state
ALTER TABLE public.purchase_orders 
DROP CONSTRAINT IF EXISTS purchase_orders_reception_status_approved_check;

ALTER TABLE public.purchase_orders 
ADD CONSTRAINT purchase_orders_reception_status_approved_check 
CHECK (
  reception_status = 'Ninguno' OR 
  (reception_status IN ('En tránsito', 'Parcial', 'Recibido') AND status IN ('Approved', 'Credit', 'Paid', 'ToPay', 'Received'))
);
