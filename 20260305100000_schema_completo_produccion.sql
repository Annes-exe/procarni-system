-- MIGRACION CONSOLIDADA DE ESQUEMA COMPLETO\n-- Generada el 2026-03-05T13:15:59.351Z\n\n-- ARCHIVO: 20260209120000_clone_missing_schema.sql\n-- Migration to clone missing production schema
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

\n\n-- ARCHIVO: 20260209120005_create_quote_comparison_tables.sql\n-- 1. Create quote_comparisons table
CREATE TABLE public.quote_comparisons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  global_exchange_rate NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.quote_comparisons ENABLE ROW LEVEL SECURITY;

-- 3. Policies for quote_comparisons
CREATE POLICY "Users can view their own comparisons" ON public.quote_comparisons
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own comparisons" ON public.quote_comparisons
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comparisons" ON public.quote_comparisons
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comparisons" ON public.quote_comparisons
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4. Create quote_comparison_items table
CREATE TABLE public.quote_comparison_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comparison_id UUID NOT NULL REFERENCES public.quote_comparisons(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  material_name TEXT NOT NULL,
  quotes JSONB NOT NULL, -- Array of quote objects
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE public.quote_comparison_items ENABLE ROW LEVEL SECURITY;

-- 6. Policies for quote_comparison_items (Inherit ownership from parent comparison)
CREATE POLICY "Users can view comparison items if they own the comparison" ON public.quote_comparison_items
FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.quote_comparisons WHERE id = comparison_id AND user_id = auth.uid()));

CREATE POLICY "Users can insert comparison items if they own the comparison" ON public.quote_comparison_items
FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.quote_comparisons WHERE id = comparison_id AND user_id = auth.uid()));

CREATE POLICY "Users can update comparison items if they own the comparison" ON public.quote_comparison_items
FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.quote_comparisons WHERE id = comparison_id AND user_id = auth.uid()));

CREATE POLICY "Users can delete comparison items if they own the comparison" ON public.quote_comparison_items
FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.quote_comparisons WHERE id = comparison_id AND user_id = auth.uid()));\n\n-- ARCHIVO: 20260209120010_create_service_order_tables.sql\n-- 1. Sequence for Service Order Number
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
));\n\n-- ARCHIVO: 20260209123000_fix_auth_trigger.sql\n-- Fix permission denied error by adding SECURITY DEFINER
-- This ensures the function runs with the privileges of the creator (postgres)
-- allowing it to insert into public.profiles even if the triggering user lacks permissions.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, username)
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'first_name', 
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    new.raw_user_meta_data ->> 'username'
  );
  RETURN new;
END;
$$;
\n\n-- ARCHIVO: 20260226150700_add_username_login_and_roles.sql\n-- Función para obtener el correo a partir del username de forma segura
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE username = p_username;
  
  RETURN v_email;
END;
$$;

-- Actualización del trigger para asignar 'username' y 'role' ('normal' por defecto)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, username, role)
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'first_name', 
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    new.raw_user_meta_data ->> 'username',
    COALESCE(new.raw_user_meta_data ->> 'role', 'normal')
  );
  RETURN new;
END;
$$;
\n\n-- ARCHIVO: 20260226150800_admin_migration_script_example.sql\n-- SCRIPT DE MIGRACIÓN MANUAL (Ejecutar en el SQL Editor de Supabase)

-- 1. Asignar un 'username' y un 'role' a los usuarios que ya existen (si no lo tienen)
-- Se asignará como username la parte del correo antes del '@'
UPDATE public.profiles
SET 
  username = SPLIT_PART(email, '@', 1),
  role = 'normal'
WHERE username IS NULL OR role IS NULL;

-- 2. Configurar la cuenta de Administrador
-- Sustituye 'tu_correo_admin@procarni.com' por tu correo real, y pon el 'username' que desees
UPDATE public.profiles
SET 
  role = 'admin',
  username = 'Admin'
WHERE email = 'sistemasprocarni2025@gmail.com';
\n\n-- ARCHIVO: 20260305000000_create_missing_ui_tables.sql\n-- 1. Table structure for public.material_categories
CREATE TABLE IF NOT EXISTS public.material_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.material_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view material_categories" ON public.material_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage material_categories" ON public.material_categories FOR ALL TO authenticated USING (true);

-- 2. Table structure for public.units_of_measure
CREATE TABLE IF NOT EXISTS public.units_of_measure (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view units_of_measure" ON public.units_of_measure FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage units_of_measure" ON public.units_of_measure FOR ALL TO authenticated USING (true);

-- 3. Table structure for public.notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own notifications" ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 4. Table structure for public.service_order_materials
CREATE TABLE IF NOT EXISTS public.service_order_materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    tax_rate NUMERIC DEFAULT 0.16,
    is_exempt BOOLEAN DEFAULT FALSE,
    supplier_code TEXT,
    unit TEXT,
    description TEXT,
    sales_percentage NUMERIC DEFAULT 0,
    discount_percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.service_order_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view service_order_materials" ON public.service_order_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage service_order_materials" ON public.service_order_materials FOR ALL TO authenticated USING (true);
\n\n