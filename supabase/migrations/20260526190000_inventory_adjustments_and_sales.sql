-- ============================================================
-- MIGRACIÓN: FLUJOS 6 Y 7 DEL MÓDULO DE INVENTARIO
-- Fecha: 2026-05-26
-- Descripción:
--   Flujo 6: Ajustes Manuales (ADJUSTMENT_ADD, ADJUSTMENT_LOSS)
--   Flujo 7: Salidas por Venta (OUT_SALE)
-- ============================================================

-- PARTE 1A: Nuevos valores al ENUM
ALTER TYPE public.inventory_transaction_type ADD VALUE IF NOT EXISTS 'ADJUSTMENT_ADD';
ALTER TYPE public.inventory_transaction_type ADD VALUE IF NOT EXISTS 'OUT_SALE';

-- PARTE 1B: Nuevas columnas en inventory_transactions
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS reason_code    TEXT,
  ADD COLUMN IF NOT EXISTS sale_reference TEXT;

COMMENT ON COLUMN public.inventory_transactions.reason_code    IS 'Motivo del ajuste manual. Obligatorio para tipos ADJUSTMENT_LOSS y ADJUSTMENT_ADD.';
COMMENT ON COLUMN public.inventory_transactions.sale_reference IS 'Referencia de factura o nota de entrega. Obligatorio para tipo OUT_SALE.';

-- PARTE 1C: Catálogo de motivos de ajuste
CREATE TABLE IF NOT EXISTS public.inventory_adjustment_reasons (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT    UNIQUE NOT NULL,
  description TEXT    NOT NULL,
  applies_to  TEXT    NOT NULL CHECK (applies_to IN ('LOSS', 'ADD', 'BOTH')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.inventory_adjustment_reasons (code, description, applies_to) VALUES
  ('DESHIDRATACION',   'Deshidratación natural en cava (merma por almacenamiento)',  'LOSS'),
  ('DETERIORO',        'Deterioro, vencimiento o daño físico (baja de mercancía)',    'LOSS'),
  ('PERDIDA_FRIO',     'Pérdida de cadena de frío (mercancía comprometida)',          'LOSS'),
  ('CONTEO_NEGATIVO',  'Ajuste por conteo físico — faltante detectado',              'LOSS'),
  ('CONTEO_POSITIVO',  'Ajuste por conteo físico — sobrante detectado',              'ADD'),
  ('CORRECCION_ERROR', 'Corrección de error de entrada previa (con reverso previo)', 'BOTH'),
  ('OTRO',             'Otro motivo (especificar en observación obligatoria)',         'BOTH')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.inventory_adjustment_reasons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_adjustment_reasons' AND policyname='adj_reasons_select') THEN
    CREATE POLICY "adj_reasons_select" ON public.inventory_adjustment_reasons FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_adjustment_reasons' AND policyname='adj_reasons_admin') THEN
    CREATE POLICY "adj_reasons_admin"  ON public.inventory_adjustment_reasons FOR ALL TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.inventory_adjustment_reasons IS 'Catálogo de motivos válidos para ajustes manuales de inventario. Obligatorio al registrar ADJUSTMENT_LOSS o ADJUSTMENT_ADD.';

-- PARTE 2: Actualizar fn_update_inventory_cpp (lógica de CPP para ADJUSTMENT_ADD)
-- Ver archivo 20260526170000_create_inventory_schema.sql para la implementación completa
-- Cambio clave: ADJUSTMENT_ADD agrega stock pero NO recalcula el CPP (se valora al CPP actual)

-- PARTE 3 y 4: RPCs registrar_ajuste_inventario y registrar_salida_venta
-- Ver scripts aplicados directamente vía MCP


-- ------------------------------------------------------------
-- PARTE 2: Nuevas columnas en inventory_transactions
-- ------------------------------------------------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS reason_code    TEXT,   -- Motivo de ajuste (FK lógica a inventory_adjustment_reasons.code)
  ADD COLUMN IF NOT EXISTS sale_reference TEXT;   -- Para OUT_SALE: Nro. Factura o Nota de Entrega

COMMENT ON COLUMN public.inventory_transactions.reason_code    IS 'Motivo del ajuste manual. Obligatorio para tipos ADJUSTMENT_LOSS y ADJUSTMENT_ADD.';
COMMENT ON COLUMN public.inventory_transactions.sale_reference IS 'Referencia de factura o nota de entrega. Obligatorio para tipo OUT_SALE.';

-- ------------------------------------------------------------
-- PARTE 3: Catálogo de motivos de ajuste
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_adjustment_reasons (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT    UNIQUE NOT NULL,
  description TEXT    NOT NULL,
  applies_to  TEXT    NOT NULL CHECK (applies_to IN ('LOSS', 'ADD', 'BOTH')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Catálogo inicial de motivos
INSERT INTO public.inventory_adjustment_reasons (code, description, applies_to) VALUES
  ('DESHIDRATACION',   'Deshidratación natural en cava (merma por almacenamiento)',  'LOSS'),
  ('DETERIORO',        'Deterioro, vencimiento o daño físico (baja de mercancía)',    'LOSS'),
  ('PERDIDA_FRIO',     'Pérdida de cadena de frío (mercancía comprometida)',          'LOSS'),
  ('CONTEO_NEGATIVO',  'Ajuste por conteo físico — faltante detectado',              'LOSS'),
  ('CONTEO_POSITIVO',  'Ajuste por conteo físico — sobrante detectado',              'ADD'),
  ('CORRECCION_ERROR', 'Corrección de error de entrada previa (con reverso previo)', 'BOTH'),
  ('OTRO',             'Otro motivo (especificar en observación obligatoria)',         'BOTH')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.inventory_adjustment_reasons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_adjustment_reasons' AND policyname='adj_reasons_select') THEN
    CREATE POLICY "adj_reasons_select" ON public.inventory_adjustment_reasons FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_adjustment_reasons' AND policyname='adj_reasons_admin') THEN
    CREATE POLICY "adj_reasons_admin"  ON public.inventory_adjustment_reasons FOR ALL TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.inventory_adjustment_reasons IS 'Catálogo de motivos válidos para ajustes manuales de inventario. Obligatorio al registrar ADJUSTMENT_LOSS o ADJUSTMENT_ADD.';
