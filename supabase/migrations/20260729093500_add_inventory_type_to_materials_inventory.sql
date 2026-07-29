-- Add inventory_type column to materials_inventory table
ALTER TABLE public.materials_inventory 
ADD COLUMN IF NOT EXISTS inventory_type TEXT DEFAULT 'Producción' CHECK (inventory_type IN ('Producción', 'Suministro'));

-- Update existing rows so that all current inventory items are set to 'Producción'
UPDATE public.materials_inventory 
SET inventory_type = 'Producción' 
WHERE inventory_type IS NULL;
