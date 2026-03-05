-- 1. Create quote_comparisons table
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
FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.quote_comparisons WHERE id = comparison_id AND user_id = auth.uid()));