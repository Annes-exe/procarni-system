-- Drop the existing constraint
ALTER TABLE public.purchase_orders 
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- Re-create the constraint with 'Received' included
ALTER TABLE public.purchase_orders 
  ADD CONSTRAINT purchase_orders_status_check 
  CHECK (status IN ('Draft', 'Sent', 'Approved', 'Rejected', 'Archived', 'Received'));
