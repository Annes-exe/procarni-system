-- Migration: Add payment_date and paid_amount to purchase_orders and service_orders, create payment_transactions table for Kardex, and set it automatically via trigger when status becomes 'Paid'
-- Created at: 2026-07-02
-- Modified at: 2026-07-02 (Added paid_amount and payment_transactions schema)

-- 1. Add payment_date and paid_amount columns to both tables
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- 2. Create payment_transactions table for Kardex History
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('purchase_order', 'service_order')),
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'VES', 'EUR')),
  exchange_rate NUMERIC,
  converted_amount NUMERIC NOT NULL,
  registered_by UUID REFERENCES auth.users(id),
  previous_paid NUMERIC DEFAULT 0 NOT NULL,
  new_paid NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS for security
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DROP POLICY IF EXISTS "Allow read access for all authenticated users on payment_transactions" ON public.payment_transactions;
CREATE POLICY "Allow read access for all authenticated users on payment_transactions"
  ON public.payment_transactions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow insert access for all authenticated users on payment_transactions" ON public.payment_transactions;
CREATE POLICY "Allow insert access for all authenticated users on payment_transactions"
  ON public.payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Trigger function to automatically manage payment_date on status change
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

-- 4. Create triggers for updates
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
