-- 1. Table structure for public.material_categories
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
