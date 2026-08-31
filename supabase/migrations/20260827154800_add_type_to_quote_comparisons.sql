-- Migracion para guardar comparaciones de precios y matrices de precios
-- Add type column to distinguish between quote comparisons and price matrices
ALTER TABLE public.quote_comparisons
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'quote_comparison' CHECK (type IN ('quote_comparison', 'price_matrix'));

-- Make material_id nullable in quote_comparison_items to support price matrix metadata and items not mapped to catalog
ALTER TABLE public.quote_comparison_items
ALTER COLUMN material_id DROP NOT NULL;

-- Update RLS policies to allow viewing comparisons and items of all users while keeping editing restricted to owners
DROP POLICY IF EXISTS "Users can view their own comparisons" ON public.quote_comparisons;
DROP POLICY IF EXISTS "Users can view comparison items if they own the comparison" ON public.quote_comparison_items;

CREATE POLICY "Users can view all comparisons"
ON public.quote_comparisons
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can view all comparison items"
ON public.quote_comparison_items
FOR SELECT
TO authenticated
USING (true);
