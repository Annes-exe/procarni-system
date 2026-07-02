-- Migration: Add payment_date to purchase_orders and service_orders and set it automatically via trigger when status becomes 'Paid'
-- Created at: 2026-07-02

-- 1. Add payment_date column to both tables
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE;

-- 2. Trigger function to automatically manage payment_date on status change
CREATE OR REPLACE FUNCTION public.handle_order_payment_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'Paid' AND (OLD.status IS DISTINCT FROM 'Paid' OR NEW.payment_date IS NULL) THEN
    NEW.payment_date := NOW();
  ELSIF NEW.status IS DISTINCT FROM 'Paid' THEN
    NEW.payment_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Create triggers for updates
DROP TRIGGER IF EXISTS tr_purchase_orders_payment_date ON public.purchase_orders;
CREATE TRIGGER tr_purchase_orders_payment_date
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_payment_date();

DROP TRIGGER IF EXISTS tr_service_orders_payment_date ON public.service_orders;
CREATE TRIGGER tr_service_orders_payment_date
  BEFORE UPDATE OF status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_payment_date();
