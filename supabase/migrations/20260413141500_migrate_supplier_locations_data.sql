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

-- 3. Normalización de datos (Casos más comunes)
-- Nota: Para una precisión total, se recomienda ejecutar el script scripts/migrate-cities.ts
-- ya que maneja límites de palabra y detección de estados explícitos.

-- Táchira / San Cristóbal
UPDATE suppliers 
SET state = 'Táchira', city = 'San Cristóbal'
WHERE (address ILIKE '%san cristobal%' OR address ILIKE '%sc%') 
AND (city IS NULL OR state IS NULL);

-- Distrito Capital / Caracas
UPDATE suppliers 
SET state = 'Distrito Capital', city = 'Caracas'
WHERE (address ILIKE '%caracas%' OR address ILIKE '%dtto capital%') 
AND (city IS NULL OR state IS NULL);

-- Zulia / Maracaibo
UPDATE suppliers 
SET state = 'Zulia', city = 'Maracaibo'
WHERE (address ILIKE '%maracaibo%') 
AND (city IS NULL OR state IS NULL);

-- Lara / Barquisimeto
UPDATE suppliers 
SET state = 'Lara', city = 'Barquisimeto'
WHERE (address ILIKE '%barquisimeto%') 
AND (city IS NULL OR state IS NULL);

-- Carabobo / Valencia
UPDATE suppliers 
SET state = 'Carabobo', city = 'Valencia'
WHERE (address ILIKE '%valencia%') 
AND (city IS NULL OR state IS NULL);

-- Aragua / Maracay
UPDATE suppliers 
SET state = 'Aragua', city = 'Maracay'
WHERE (address ILIKE '%maracay%') 
AND (city IS NULL OR state IS NULL);

-- Bolívar / Puerto Ordaz
UPDATE suppliers 
SET state = 'Bolívar', city = 'Puerto Ordaz'
WHERE (address ILIKE '%puerto ordaz%' OR address ILIKE '%pzo%') 
AND (city IS NULL OR state IS NULL);

COMMENT ON COLUMN suppliers.city IS 'Ciudad o Municipio detectado o seleccionado manualmente.';
COMMENT ON COLUMN suppliers.state IS 'Estado federal de Venezuela.';
