-- Migration: Update purchase_orders status constraint to allow Credit, ToPay, and Paid statuses
-- Created at: 2026-07-01

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check 
  CHECK (status = ANY (ARRAY[
    'Draft'::text, 
    'Sent'::text, 
    'Approved'::text, 
    'Rejected'::text, 
    'Archived'::text, 
    'Received'::text,
    'Credit'::text,
    'ToPay'::text,
    'Paid'::text
  ]));
