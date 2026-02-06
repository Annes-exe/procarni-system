-- 1. Sequence for Service Order Number
CREATE SEQUENCE public.service_order_sequence START 1;

-- 2. Function to set the sequence number
CREATE OR REPLACE FUNCTION public.set_service_order_sequence()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number = NEXTVAL('public.service_order_sequence');
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Table service_orders
CREATE TABLE public.service_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_number INTEGER UNIQUE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  equipment_name TEXT NOT NULL,
  service_type TEXT NOT NULL, -- e.g., 'Revisión', 'Reparación', 'Instalación', 'Mantenimiento'
  detailed_service_description TEXT, -- New field for detailed description
  destination_address TEXT NOT NULL, -- e.g., 'PROCARNI', 'EMPOMACA', 'MONTANO'
  observations TEXT,
  currency TEXT NOT NULL,
  exchange_rate NUMERIC,
  status TEXT NOT NULL DEFAULT 'Draft', -- Draft, Sent, Approved, Rejected, Archived
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Trigger to set sequence number
CREATE TRIGGER set_so_sequence_trigger
BEFORE INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_service_order_sequence();

-- 5. Table service_order_items
CREATE TABLE public.service_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL, -- Detailed service/cost description
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  tax_rate NUMERIC NOT NULL DEFAULT 0.16,
  is_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  sales_percentage NUMERIC DEFAULT 0,
  discount_percentage NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. RLS for service_orders
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all service orders" ON public.service_orders
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create service orders" ON public.service_orders
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own service orders" ON public.service_orders
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own service orders" ON public.service_orders
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 7. RLS for service_order_items
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view service order items" ON public.service_order_items
FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.service_orders
    WHERE service_orders.id = service_order_items.order_id
    AND service_orders.user_id = auth.uid()
));

CREATE POLICY "Authenticated users can manage service order items" ON public.service_order_items
FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.service_orders
    WHERE service_orders.id = service_order_items.order_id
    AND service_orders.user_id = auth.uid()
));