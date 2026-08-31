-- Create sequences for requisitions
CREATE SEQUENCE IF NOT EXISTS public.purchase_requisition_sequence START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.service_requisition_sequence START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.warehouse_requisition_sequence START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.logbook_requisition_sequence START WITH 1;

-- Create requisitions table
CREATE TABLE IF NOT EXISTS public.requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('purchase', 'service', 'warehouse', 'logbook')),
    sequence_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);

-- Trigger function to auto-assign sequence numbers based on type
CREATE OR REPLACE FUNCTION public.assign_requisition_sequence()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'purchase' THEN
        NEW.sequence_number := nextval('public.purchase_requisition_sequence');
    ELSIF NEW.type = 'service' THEN
        NEW.sequence_number := nextval('public.service_requisition_sequence');
    ELSIF NEW.type = 'warehouse' THEN
        NEW.sequence_number := nextval('public.warehouse_requisition_sequence');
    ELSIF NEW.type = 'logbook' THEN
        NEW.sequence_number := nextval('public.logbook_requisition_sequence');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Set up trigger
CREATE OR REPLACE TRIGGER set_requisition_sequence
BEFORE INSERT ON public.requisitions
FOR EACH ROW
EXECUTE FUNCTION public.assign_requisition_sequence();

-- Enable RLS
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

-- Create policies for requisitions
DROP POLICY IF EXISTS "Allow authenticated users to read requisitions" ON public.requisitions;
CREATE POLICY "Allow authenticated users to read requisitions" ON public.requisitions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert requisitions" ON public.requisitions;
CREATE POLICY "Allow authenticated users to insert requisitions" ON public.requisitions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Add requisition_number column to purchase_orders and service_orders tables
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS requisition_number TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS requisition_number TEXT;

-- Add comments for documentation
COMMENT ON TABLE public.requisitions IS 'Control de formatos de requisiciones impresas generadas por el sistema.';
COMMENT ON COLUMN public.requisitions.type IS 'Tipo de requisición: purchase (compra), service (servicio), warehouse (almacén) o logbook (bitácora).';
COMMENT ON COLUMN public.requisitions.sequence_number IS 'Número correlativo único por tipo de requisición.';
COMMENT ON COLUMN public.purchase_orders.requisition_number IS 'Número de correlativo de requisición de compra asociado.';
COMMENT ON COLUMN public.service_orders.requisition_number IS 'Número de correlativo de requisición de servicio asociado.';
