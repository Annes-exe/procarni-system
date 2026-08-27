-- Migracion para guardar comparaciones de precios y matrices de precios
-- Add type column to distinguish between quote comparisons and price matrices
ALTER TABLE public.quote_comparisons
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'quote_comparison' CHECK (type IN ('quote_comparison', 'price_matrix'));

-- Make material_id nullable in quote_comparison_items to support price matrix metadata and items not mapped to catalog
ALTER TABLE public.quote_comparison_items
ALTER COLUMN material_id DROP NOT NULL;
