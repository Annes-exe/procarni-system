-- Migración de datos de ubicación de proveedores
-- Este script normaliza las columnas city y state para proveedores existentes
-- basándose en palabras clave encontradas en la columna address.

-- 1. Asegurar que las columnas existen (por si acaso no se han corrido migraciones previas)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='suppliers' AND column_name='city') THEN
        ALTER TABLE suppliers ADD COLUMN city TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name='suppliers' AND column_name='state') THEN
        ALTER TABLE suppliers ADD COLUMN state TEXT;
    END IF;
END $$;

-- 2. Índices para mejorar el filtrado por ubicación
CREATE INDEX IF NOT EXISTS idx_suppliers_location ON suppliers(state, city);
