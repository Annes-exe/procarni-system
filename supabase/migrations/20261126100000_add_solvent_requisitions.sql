-- ==============================================================================
-- MIGRACIÓN: AGREGAR FORMATOS DE SOLVENTE TAPA ROJA Y TAPA MARRÓN A REQUISICIONES
-- ==============================================================================

-- 1. Crear secuencias correlativas para solvente tapa roja y solvente tapa marrón
CREATE SEQUENCE IF NOT EXISTS public.solvent_red_requisition_sequence START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.solvent_brown_requisition_sequence START WITH 1;

-- 2. Actualizar la restricción CHECK en la tabla requisitions para admitir los nuevos tipos
ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_type_check;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_type_check 
    CHECK (type IN ('purchase', 'service', 'warehouse', 'logbook', 'solvent_red', 'solvent_brown'));

-- 3. Agregar columnas opcionales de lote y responsable si no existen
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS lot_date TEXT;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS responsible TEXT;

-- 4. Actualizar función trigger para asignar automáticamente los correlativos
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
    ELSIF NEW.type = 'solvent_red' THEN
        NEW.sequence_number := nextval('public.solvent_red_requisition_sequence');
    ELSIF NEW.type = 'solvent_brown' THEN
        NEW.sequence_number := nextval('public.solvent_brown_requisition_sequence');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Actualizar comentarios de documentación
COMMENT ON COLUMN public.requisitions.type IS 'Tipo de requisición: purchase (compra), service (servicio), warehouse (almacén), logbook (bitácora), solvent_red (solvente tapa roja) o solvent_brown (solvente tapa marrón).';
