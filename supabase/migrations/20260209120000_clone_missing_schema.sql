-- Migration to clone missing production schema
-- Created based on introspection of production database

-- 1. Sequences
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_sequence START 1;
CREATE SEQUENCE IF NOT EXISTS public.supplier_code_sequence START 1;
CREATE SEQUENCE IF NOT EXISTS public.material_code_sequence START 1;

-- 2. Tables

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- companies
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE,
  rif TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  fiscal_data JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update companies" ON public.companies FOR UPDATE TO authenticated USING (true);

-- suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT,
  rif TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  phone_2 TEXT,
  instagram TEXT,
  address TEXT,
  payment_terms TEXT CHECK (payment_terms IN ('Contado', 'Crédito', 'Otro')),
  custom_payment_terms TEXT,
  credit_days INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);

-- materials
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT,
  category TEXT,
  unit TEXT,
  is_exempt BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view materials" ON public.materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert materials" ON public.materials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update materials" ON public.materials FOR UPDATE TO authenticated USING (true);

-- supplier_materials
CREATE TABLE IF NOT EXISTS public.supplier_materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id),
  material_id UUID REFERENCES public.materials(id),
  specification TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.supplier_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view supplier_materials" ON public.supplier_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert supplier_materials" ON public.supplier_materials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update supplier_materials" ON public.supplier_materials FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete supplier_materials" ON public.supplier_materials FOR DELETE TO authenticated USING (true);


-- quote_requests
CREATE TABLE IF NOT EXISTS public.quote_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id),
  company_id UUID REFERENCES public.companies(id),
  currency TEXT CHECK (currency IN ('VES', 'USD')),
  exchange_rate NUMERIC,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Approved', 'Archived')),
  created_by TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view quote_requests" ON public.quote_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert quote_requests" ON public.quote_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update quote_requests" ON public.quote_requests FOR UPDATE TO authenticated USING (true);

-- quote_request_items
CREATE TABLE IF NOT EXISTS public.quote_request_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.quote_requests(id),
  material_name TEXT,
  description TEXT,
  quantity NUMERIC,
  unit TEXT,
  is_exempt BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.quote_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view quote_request_items" ON public.quote_request_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert quote_request_items" ON public.quote_request_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update quote_request_items" ON public.quote_request_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete quote_request_items" ON public.quote_request_items FOR DELETE TO authenticated USING (true);

-- purchase_orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_number INTEGER UNIQUE,
  supplier_id UUID REFERENCES public.suppliers(id),
  company_id UUID REFERENCES public.companies(id),
  quote_request_id UUID REFERENCES public.quote_requests(id),
  currency TEXT CHECK (currency IN ('VES', 'USD')),
  exchange_rate NUMERIC,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Approved', 'Rejected', 'Archived')),
  delivery_date DATE,
  payment_terms TEXT,
  custom_payment_terms TEXT,
  credit_days INTEGER DEFAULT 0,
  observations TEXT,
  created_by TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view purchase_orders" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert purchase_orders" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update purchase_orders" ON public.purchase_orders FOR UPDATE TO authenticated USING (true);

-- purchase_order_items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.purchase_orders(id),
  material_id UUID REFERENCES public.materials(id),
  material_name TEXT,
  supplier_code TEXT,
  description TEXT,
  quantity NUMERIC,
  unit TEXT,
  unit_price NUMERIC,
  tax_rate NUMERIC DEFAULT 0.16,
  is_exempt BOOLEAN DEFAULT false,
  sales_percentage NUMERIC DEFAULT 0,
  discount_percentage NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view purchase_order_items" ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert purchase_order_items" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update purchase_order_items" ON public.purchase_order_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete purchase_order_items" ON public.purchase_order_items FOR DELETE TO authenticated USING (true);

-- supplier_quotes
CREATE TABLE IF NOT EXISTS public.supplier_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID REFERENCES public.materials(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  quote_request_id UUID REFERENCES public.quote_requests(id),
  unit_price NUMERIC,
  currency TEXT,
  exchange_rate NUMERIC,
  valid_until DATE,
  delivery_days INTEGER,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view supplier_quotes" ON public.supplier_quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert supplier_quotes" ON public.supplier_quotes FOR INSERT TO authenticated WITH CHECK (true);

-- price_history
CREATE TABLE IF NOT EXISTS public.price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID REFERENCES public.materials(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  unit_price NUMERIC,
  currency TEXT,
  exchange_rate NUMERIC,
  user_id UUID REFERENCES auth.users(id),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view price_history" ON public.price_history FOR SELECT TO authenticated USING (true);

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT,
  user_email TEXT,
  details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- fichas_tecnicas
CREATE TABLE IF NOT EXISTS public.fichas_tecnicas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_producto TEXT,
  proveedor_id UUID REFERENCES public.suppliers(id),
  storage_url TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.fichas_tecnicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view fichas_tecnicas" ON public.fichas_tecnicas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert fichas_tecnicas" ON public.fichas_tecnicas FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Functions

CREATE OR REPLACE FUNCTION public.set_purchase_order_sequence()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number = NEXTVAL('public.purchase_order_sequence');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_supplier_code_sequence()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code = 'P' || LPAD(NEXTVAL('public.supplier_code_sequence')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_material_code_sequence()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code = 'MP' || LPAD(NEXTVAL('public.material_code_sequence')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Helper functions for manual sequence reset/management
CREATE OR REPLACE FUNCTION public.reset_purchase_order_sequence()
RETURNS VOID LANGUAGE SQL AS $$
  SELECT setval('public.purchase_order_sequence', 1, false);
$$;

CREATE OR REPLACE FUNCTION public.get_last_purchase_order_sequence()
RETURNS INTEGER LANGUAGE PLPGSQL AS $$
DECLARE
  last_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(sequence_number), 0) INTO last_seq FROM public.purchase_orders;
  RETURN last_seq;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_purchase_order_sequence_start(start_number INTEGER)
RETURNS VOID LANGUAGE PLPGSQL AS $$
BEGIN
  IF start_number = 1 THEN
    PERFORM public.reset_purchase_order_sequence();
  ELSE
    PERFORM setval('public.purchase_order_sequence', start_number - 1);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_supplier_code_sequence()
RETURNS VOID LANGUAGE SQL AS $$
  SELECT setval('public.supplier_code_sequence', 1, false);
$$;

CREATE OR REPLACE FUNCTION public.reset_material_code_sequence()
RETURNS VOID LANGUAGE SQL AS $$
  SELECT setval('public.material_code_sequence', 1, false);
$$;

-- Reporting functions
CREATE OR REPLACE FUNCTION public.get_top_suppliers_by_order_count(limit_count INTEGER)
RETURNS TABLE (supplier_id UUID, supplier_name TEXT, order_count BIGINT)
LANGUAGE SQL AS $$
SELECT
    s.id AS supplier_id,
    s.name AS supplier_name,
    COUNT(po.id) AS order_count
FROM
    public.suppliers s
JOIN
    public.purchase_orders po ON s.id = po.supplier_id
GROUP BY
    s.id, s.name
ORDER BY
    order_count DESC
LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION public.get_top_materials_by_quantity(limit_count INTEGER)
RETURNS TABLE (material_name TEXT, total_quantity NUMERIC)
LANGUAGE SQL AS $$
SELECT
    poi.material_name,
    SUM(poi.quantity) AS total_quantity
FROM
    public.purchase_order_items poi
GROUP BY
    poi.material_name
ORDER BY
    total_quantity DESC
LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, username)
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'first_name', 
    new.raw_user_meta_data ->> 'last_name',
    new.email, -- Capture the email used for authentication
    new.raw_user_meta_data ->> 'username' -- Capture username from metadata
  );
  RETURN new;
END;
$$;

-- 4. Triggers

CREATE TRIGGER set_po_sequence_trigger
BEFORE INSERT ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_sequence();

CREATE TRIGGER on_material_insert
BEFORE INSERT ON public.materials
FOR EACH ROW EXECUTE FUNCTION public.set_material_code_sequence();

CREATE TRIGGER on_supplier_insert
BEFORE INSERT ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_supplier_code_sequence();

-- Auth trigger
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

