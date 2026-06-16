-- ============================================================
-- MIGRACIÓN: MÓDULO DE INVENTARIO PROCARNI
-- Fecha: 2026-05-26
-- Descripción: Crea el esquema completo del motor de inventario
--   con Costo Promedio Ponderado (CPP), Kardex inmutable,
--   generación automática de SKUs, cierres mensuales y
--   snapshots diarios.
-- ============================================================

-- ============================================================
-- SECCIÓN 1: EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- ============================================================
-- SECCIÓN 2: TIPOS ENUMERADOS
-- ============================================================

-- Tipo de transacción del Kardex
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_transaction_type') THEN
    CREATE TYPE public.inventory_transaction_type AS ENUM (
      'IN_PURCHASE',       -- Entrada planificada desde Orden de Compra
      'IN_DIRECT',         -- Entrada directa ("el WhatsApp")
      'OUT_PRODUCTION',    -- Salida a producción
      'ADJUSTMENT_LOSS',   -- Merma de traslado (automática)
      'ADJUSTMENT_MANUAL', -- Ajuste manual autorizado
      'REVERSAL'           -- Reverso de auditoría
    );
  END IF;
END $$;

-- Estado de los periodos contables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_period_status') THEN
    CREATE TYPE public.inventory_period_status AS ENUM ('ABIERTO', 'CERRADO');
  END IF;
END $$;

-- Categorías de materiales habilitadas para inventario
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_category') THEN
    CREATE TYPE public.inventory_category AS ENUM ('MPF', 'MPS', 'EMP', 'ETQ');
  END IF;
END $$;


-- ============================================================
-- SECCIÓN 3: TABLAS
-- ============================================================

-- ------------------------------------------------------------
-- 3.1 inventory_families: Catálogo de familias/prefijos de SKU
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_families (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  category          public.inventory_category NOT NULL UNIQUE, -- Ej: 'EMP'
  prefix            TEXT    NOT NULL UNIQUE,                   -- Ej: 'EMP'
  description       TEXT,                                      -- Ej: 'Empaques'
  current_sequence  INTEGER NOT NULL DEFAULT 0,                -- Último número asignado
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed inicial de familias
INSERT INTO public.inventory_families (category, prefix, description, current_sequence) VALUES
  ('MPF', 'MPF', 'Materia Prima Fresca',  0),
  ('MPS', 'MPS', 'Materia Prima Seca',    0),
  ('EMP', 'EMP', 'Empaques',              0),
  ('ETQ', 'ETQ', 'Etiquetas',             0)
ON CONFLICT (category) DO NOTHING;

ALTER TABLE public.inventory_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_families_select" ON public.inventory_families FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_families_all"    ON public.inventory_families FOR ALL    TO authenticated USING (true);


-- ------------------------------------------------------------
-- 3.2 materials_inventory: Tabla hija — materiales habilitados
--     para almacén. Extiende public.materials.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materials_inventory (
  material_id           UUID    PRIMARY KEY REFERENCES public.materials(id) ON DELETE RESTRICT,
  sku                   TEXT    UNIQUE NOT NULL,          -- Ej: EMP-046 (autogenerado)
  inventory_category    public.inventory_category NOT NULL,
  unit                  TEXT    NOT NULL DEFAULT 'kg',    -- Unidad de medida en almacén
  last_purchase_price   NUMERIC(18,6) DEFAULT 0,          -- Último precio de compra
  current_stock         NUMERIC(18,4) DEFAULT 0,          -- Stock actual en almacén
  average_unit_cost     NUMERIC(18,6) DEFAULT 0,          -- CPP actual
  total_value           NUMERIC(18,4) DEFAULT 0,          -- = current_stock * average_unit_cost
  min_stock_alert       NUMERIC(18,4) DEFAULT 0,          -- Alerta de stock mínimo
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  enabled_by            UUID REFERENCES auth.users(id),
  enabled_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.materials_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mat_inv_select" ON public.materials_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "mat_inv_insert" ON public.materials_inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mat_inv_update" ON public.materials_inventory FOR UPDATE TO authenticated USING (true);


-- ------------------------------------------------------------
-- 3.3 inventory_periods: Control de periodos contables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_periods (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  period_name   TEXT    NOT NULL UNIQUE,   -- Ej: 'Mayo 2026'
  start_date    DATE    NOT NULL,
  end_date      DATE    NOT NULL,
  status        public.inventory_period_status NOT NULL DEFAULT 'ABIERTO',
  closed_by     UUID REFERENCES auth.users(id),
  closed_at     TIMESTAMP WITH TIME ZONE,
  notes         TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT period_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT period_no_overlap  EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

ALTER TABLE public.inventory_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_periods_select" ON public.inventory_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_periods_insert" ON public.inventory_periods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inv_periods_update" ON public.inventory_periods FOR UPDATE TO authenticated USING (true);


-- ------------------------------------------------------------
-- 3.4 inventory_transactions: El Kardex — INMUTABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id                UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id       UUID      NOT NULL REFERENCES public.materials_inventory(material_id) ON DELETE RESTRICT,
  transaction_date  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  transaction_type  public.inventory_transaction_type NOT NULL,

  -- Cantidades
  quantity          NUMERIC(18,4) NOT NULL,  -- +positivo = entrada, -negativo = salida
  expected_quantity NUMERIC(18,4),           -- Peso según guía / cantidad teórica
  actual_quantity   NUMERIC(18,4),           -- Peso real recibido / cantidad real usada

  -- Costos (calculados al momento de la transacción)
  unit_cost         NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_cost        NUMERIC(18,4) GENERATED ALWAYS AS (quantity * unit_cost) STORED,

  -- Snapshot del stock DESPUÉS de esta transacción (para auditoría sin recálculo)
  stock_after       NUMERIC(18,4),
  avg_cost_after    NUMERIC(18,6),

  -- Referencias y trazabilidad
  reference_doc     TEXT,          -- Ej: 'OC-00123', 'GUIA-456', 'MA-c77332'
  destination_data  JSONB,         -- Cápsulas de receta: [{producto, lotes}]
  reverses_id       UUID REFERENCES public.inventory_transactions(id), -- Si es un reverso

  -- Auditoría
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  audit_note        TEXT          -- Nota automática de desviación, si aplica
);

-- Índices para consultas frecuentes del Kardex
CREATE INDEX IF NOT EXISTS idx_inv_tx_material   ON public.inventory_transactions (material_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_date        ON public.inventory_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_type        ON public.inventory_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref_doc     ON public.inventory_transactions (reference_doc);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_tx_select" ON public.inventory_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_tx_insert" ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK (true);
-- NO se crean políticas de UPDATE ni DELETE: el trigger las bloqueará.


-- ------------------------------------------------------------
-- 3.5 inventory_snapshots: Foto diaria del almacén
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_snapshots (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date     DATE    NOT NULL DEFAULT CURRENT_DATE,
  material_id       UUID    NOT NULL REFERENCES public.materials_inventory(material_id) ON DELETE RESTRICT,
  stock_quantity    NUMERIC(18,4) NOT NULL,
  average_unit_cost NUMERIC(18,6) NOT NULL,
  total_value       NUMERIC(18,4) NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (snapshot_date, material_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_snap_date     ON public.inventory_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_snap_material ON public.inventory_snapshots (material_id, snapshot_date DESC);

ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_snap_select" ON public.inventory_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_snap_insert" ON public.inventory_snapshots FOR INSERT TO authenticated WITH CHECK (true);


-- ============================================================
-- SECCIÓN 4: FUNCIONES Y TRIGGERS
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 CANDADO: Prevenir UPDATE o DELETE en el Kardex
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prevent_kardex_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'OPERACIÓN DENEGADA: El Kardex de inventario es inmutable. '
    'Los errores se corrigen emitiendo una transacción de REVERSAL. '
    'Operación intentada: % sobre el registro ID: %',
    TG_OP, OLD.id
  USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_prevent_kardex_mutation
  BEFORE UPDATE OR DELETE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_kardex_mutation();


-- ------------------------------------------------------------
-- 4.2 CANDADO: Validar que el periodo contable esté abierto
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_inventory_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_name   TEXT;
  v_period_status public.inventory_period_status;
BEGIN
  SELECT period_name, status
  INTO   v_period_name, v_period_status
  FROM   public.inventory_periods
  WHERE  NEW.transaction_date::date BETWEEN start_date AND end_date
  LIMIT  1;

  -- Si existe un periodo para esa fecha y está CERRADO → bloquear
  IF FOUND AND v_period_status = 'CERRADO' THEN
    RAISE EXCEPTION
      'OPERACIÓN DENEGADA: El periodo contable "%" ya fue cerrado. '
      'No se pueden registrar ni reversar movimientos en fechas de ese periodo.',
      v_period_name
    USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_inventory_period
  BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_inventory_period();


-- ------------------------------------------------------------
-- 4.3 CEREBRO: Actualizar CPP y stock en materials_inventory
--     Se ejecuta ANTES de cada INSERT en el Kardex.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_update_inventory_cpp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock     NUMERIC(18,4);
  v_current_avg_cost  NUMERIC(18,6);
  v_new_stock         NUMERIC(18,4);
  v_new_avg_cost      NUMERIC(18,6);
  v_new_total_value   NUMERIC(18,4);
BEGIN
  -- Leer valores actuales con bloqueo para concurrencia
  SELECT current_stock, average_unit_cost
  INTO   v_current_stock, v_current_avg_cost
  FROM   public.materials_inventory
  WHERE  material_id = NEW.material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El material % no está habilitado para inventario o está inactivo.', NEW.material_id;
  END IF;

  -- Calcular nuevo stock
  v_new_stock := v_current_stock + NEW.quantity;

  -- Calcular nuevo CPP (solo en entradas positivas)
  IF NEW.quantity > 0 THEN
    IF v_new_stock > 0 THEN
      v_new_avg_cost := (
        (v_current_stock * v_current_avg_cost) + (NEW.quantity * NEW.unit_cost)
      ) / v_new_stock;
    ELSE
      v_new_avg_cost := NEW.unit_cost;
    END IF;
  ELSE
    -- Salida o ajuste negativo: el CPP no cambia
    v_new_avg_cost := v_current_avg_cost;
  END IF;

  -- Calcular valor total
  v_new_total_value := GREATEST(v_new_stock, 0) * v_new_avg_cost;

  -- Actualizar la tabla madre
  UPDATE public.materials_inventory
  SET
    current_stock     = v_new_stock,
    average_unit_cost = v_new_avg_cost,
    total_value       = v_new_total_value,
    last_purchase_price = CASE
      WHEN NEW.transaction_type IN ('IN_PURCHASE', 'IN_DIRECT') THEN NEW.unit_cost
      ELSE last_purchase_price
    END,
    updated_at = NOW()
  WHERE material_id = NEW.material_id;

  -- Asignar el snapshot del stock directamente a las columnas del registro antes de insertarse
  NEW.stock_after    := v_new_stock;
  NEW.avg_cost_after := v_new_avg_cost;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_inventory_cpp ON public.inventory_transactions;
CREATE TRIGGER trg_update_inventory_cpp
  BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_inventory_cpp();


-- ------------------------------------------------------------
-- 4.4 GENERADOR DE SKU: Al habilitar un material en almacén
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_inventory_sku()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix    TEXT;
  v_next_seq  INTEGER;
  v_sku       TEXT;
BEGIN
  -- Incrementar la secuencia de la familia y obtener el nuevo número (atómico)
  UPDATE public.inventory_families
  SET current_sequence = current_sequence + 1
  WHERE category = NEW.inventory_category
  RETURNING prefix, current_sequence INTO v_prefix, v_next_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Familia de inventario no encontrada para categoría: %', NEW.inventory_category;
  END IF;

  -- Generar SKU con formato: PREFIJO-NNN (3 dígitos mínimo, ej. EMP-046)
  v_sku := v_prefix || '-' || LPAD(v_next_seq::TEXT, 3, '0');

  NEW.sku := v_sku;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_inventory_sku
  BEFORE INSERT ON public.materials_inventory
  FOR EACH ROW
  WHEN (NEW.sku IS NULL OR NEW.sku = '')
  EXECUTE FUNCTION public.fn_generate_inventory_sku();


-- ============================================================
-- SECCIÓN 5: FUNCIONES RPC (Llamadas desde el Frontend)
-- ============================================================

-- ------------------------------------------------------------
-- 5.1 RPC: registrar_recepcion_inventario
--     Gestiona entradas (desde OC o directas) con merma automática.
--     El frontend llama esta función; nunca hace INSERTs directos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_recepcion_inventario(
  p_material_id       UUID,
  p_transaction_type  public.inventory_transaction_type,  -- 'IN_PURCHASE' o 'IN_DIRECT'
  p_peso_guia         NUMERIC,   -- Cantidad según guía del proveedor
  p_peso_recibido     NUMERIC,   -- Cantidad real recibida en almacén
  p_unit_cost         NUMERIC,   -- Precio unitario de compra
  p_reference_doc     TEXT,      -- Ej: 'OC-00123' o número de guía
  p_transaction_date  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  p_created_by        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merma          NUMERIC(18,4);
  v_entrada_id     UUID;
  v_merma_id       UUID;
  v_audit_note     TEXT;
BEGIN
  -- Validar que el tipo sea de entrada
  IF p_transaction_type NOT IN ('IN_PURCHASE', 'IN_DIRECT') THEN
    RAISE EXCEPTION 'registrar_recepcion_inventario solo acepta tipos IN_PURCHASE o IN_DIRECT.';
  END IF;

  -- Validar que el material esté habilitado para inventario
  IF NOT EXISTS (SELECT 1 FROM public.materials_inventory WHERE material_id = p_material_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'El material % no está habilitado para inventario o está inactivo.', p_material_id;
  END IF;

  -- Calcular merma
  v_merma := p_peso_guia - p_peso_recibido;

  -- Construir nota de auditoría si hay merma
  IF v_merma > 0 THEN
    v_audit_note := FORMAT(
      'Merma de traslado detectada: %s kg (Guía: %s kg | Recibido: %s kg). '
      'Ajuste automático ADJUSTMENT_LOSS generado.',
      ROUND(v_merma, 4), ROUND(p_peso_guia, 4), ROUND(p_peso_recibido, 4)
    );
  END IF;

  -- PASO 1: Insertar la transacción de entrada por la cantidad de la GUÍA
  INSERT INTO public.inventory_transactions (
    material_id, transaction_date, transaction_type,
    quantity, expected_quantity, actual_quantity,
    unit_cost, reference_doc, created_by, audit_note
  ) VALUES (
    p_material_id, p_transaction_date, p_transaction_type,
    p_peso_guia,   -- El Kardex registra lo que dice la guía
    p_peso_guia,
    p_peso_recibido,
    p_unit_cost,
    p_reference_doc,
    p_created_by,
    v_audit_note
  )
  RETURNING id INTO v_entrada_id;

  -- PASO 2: Si existe merma, disparar el ajuste automático
  IF v_merma > 0 THEN
    INSERT INTO public.inventory_transactions (
      material_id, transaction_date, transaction_type,
      quantity, expected_quantity, actual_quantity,
      unit_cost, reference_doc, created_by, audit_note
    ) VALUES (
      p_material_id,
      p_transaction_date,
      'ADJUSTMENT_LOSS',
      -v_merma,        -- Negativo porque descuenta del stock
      p_peso_guia,
      p_peso_recibido,
      p_unit_cost,     -- Se valoriza al mismo costo de la entrada
      p_reference_doc, -- Misma referencia para trazabilidad
      p_created_by,
      FORMAT('Merma de traslado automática asociada a entrada %s. Referencia: %s', v_entrada_id, p_reference_doc)
    )
    RETURNING id INTO v_merma_id;
  END IF;

  -- Devolver resumen de la operación al frontend
  RETURN jsonb_build_object(
    'success',      true,
    'entrada_id',   v_entrada_id,
    'merma_id',     v_merma_id,
    'peso_guia',    p_peso_guia,
    'peso_recibido',p_peso_recibido,
    'merma_kg',     v_merma,
    'unit_cost',    p_unit_cost,
    'reference_doc',p_reference_doc
  );

EXCEPTION WHEN OTHERS THEN
  -- El ROLLBACK es automático al salir con excepción
  RAISE;
END;
$$;


-- ------------------------------------------------------------
-- 5.2 RPC: registrar_salida_produccion
--     Gestiona la salida de materiales a una orden de producción.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_salida_produccion(
  p_orden_id          TEXT,         -- Ej: 'MA-c77332'
  p_destination_data  JSONB,        -- Cápsulas: [{producto, lotes}]
  p_items             JSONB,        -- Array: [{material_id, cantidad_real, material_original_id?, nota?}]
  p_transaction_date  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  p_created_by        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          JSONB;
  v_material_id   UUID;
  v_cantidad      NUMERIC(18,4);
  v_cpp_actual    NUMERIC(18,6);
  v_tx_id         UUID;
  v_resultados    JSONB := '[]'::JSONB;
  v_audit_note    TEXT;
BEGIN
  -- Iterar sobre cada ítem del despacho
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_material_id := (v_item->>'material_id')::UUID;
    v_cantidad    := (v_item->>'cantidad_real')::NUMERIC;

    -- Obtener el CPP actual del material
    SELECT average_unit_cost INTO v_cpp_actual
    FROM   public.materials_inventory
    WHERE  material_id = v_material_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Material % no habilitado para inventario.', v_material_id;
    END IF;

    -- Validar stock suficiente
    IF (SELECT current_stock FROM public.materials_inventory WHERE material_id = v_material_id) < v_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente para el material %. Stock actual: %, requerido: %.',
        v_material_id,
        (SELECT current_stock FROM public.materials_inventory WHERE material_id = v_material_id),
        v_cantidad;
    END IF;

    -- Construir nota si es un sustituto
    IF v_item ? 'material_original_id' AND (v_item->>'material_original_id') IS NOT NULL THEN
      v_audit_note := FORMAT(
        'SUSTITUTO: Este material reemplaza al ítem original ID %s en la orden %s.',
        v_item->>'material_original_id',
        p_orden_id
      );
    ELSE
      v_audit_note := NULL;
    END IF;

    -- Insertar la salida (cantidad negativa)
    INSERT INTO public.inventory_transactions (
      material_id, transaction_date, transaction_type,
      quantity, expected_quantity, actual_quantity,
      unit_cost, reference_doc, destination_data,
      created_by, audit_note
    ) VALUES (
      v_material_id,
      p_transaction_date,
      'OUT_PRODUCTION',
      -v_cantidad,   -- Negativo: sale del almacén
      (v_item->>'cantidad_teorica')::NUMERIC,
      v_cantidad,
      v_cpp_actual,  -- CPP exacto del momento
      p_orden_id,
      p_destination_data,
      p_created_by,
      v_audit_note
    )
    RETURNING id INTO v_tx_id;

    -- Acumular resultado para el frontend
    v_resultados := v_resultados || jsonb_build_object(
      'tx_id',       v_tx_id,
      'material_id', v_material_id,
      'cantidad',    v_cantidad,
      'unit_cost',   v_cpp_actual,
      'total_cost',  v_cantidad * v_cpp_actual
    );

  END LOOP;

  RETURN jsonb_build_object(
    'success',    true,
    'orden_id',   p_orden_id,
    'transacciones', v_resultados
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;


-- ------------------------------------------------------------
-- 5.3 RPC: cerrar_periodo_inventario
--     Cierra un periodo contable; solo rol 'admin' puede ejecutarlo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_periodo_inventario(
  p_period_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period  public.inventory_periods%ROWTYPE;
  v_user_role TEXT;
BEGIN
  -- Verificar rol del usuario
  SELECT role INTO v_user_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: Solo un administrador puede cerrar periodos contables.'
    USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Obtener el periodo
  SELECT * INTO v_period FROM public.inventory_periods WHERE id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Periodo contable no encontrado: %', p_period_id;
  END IF;

  IF v_period.status = 'CERRADO' THEN
    RAISE EXCEPTION 'El periodo "%" ya se encuentra cerrado.', v_period.period_name;
  END IF;

  -- Ejecutar el snapshot final del periodo antes de cerrarlo
  INSERT INTO public.inventory_snapshots (snapshot_date, material_id, stock_quantity, average_unit_cost, total_value)
  SELECT
    v_period.end_date,
    material_id,
    current_stock,
    average_unit_cost,
    total_value
  FROM public.materials_inventory
  WHERE is_active = TRUE
  ON CONFLICT (snapshot_date, material_id) DO UPDATE SET
    stock_quantity    = EXCLUDED.stock_quantity,
    average_unit_cost = EXCLUDED.average_unit_cost,
    total_value       = EXCLUDED.total_value;

  -- Cerrar el periodo
  UPDATE public.inventory_periods
  SET
    status    = 'CERRADO',
    closed_by = auth.uid(),
    closed_at = NOW()
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success',     true,
    'period_name', v_period.period_name,
    'closed_at',   NOW()
  );
END;
$$;


-- ------------------------------------------------------------
-- 5.4 RPC: registrar_reverso_inventario
--     Emite una transacción compensatoria para corregir un error.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_reverso_inventario(
  p_transaction_id_a_revertir UUID,
  p_motivo                    TEXT,
  p_created_by                UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original public.inventory_transactions%ROWTYPE;
  v_reverso_id UUID;
BEGIN
  -- Obtener la transacción original
  SELECT * INTO v_original FROM public.inventory_transactions WHERE id = p_transaction_id_a_revertir;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transacción original no encontrada: %', p_transaction_id_a_revertir;
  END IF;

  -- No se puede reversar un reverso
  IF v_original.transaction_type = 'REVERSAL' THEN
    RAISE EXCEPTION 'No se puede reversar una transacción de REVERSAL (ID: %).', p_transaction_id_a_revertir;
  END IF;

  -- No se puede reversar si ya tiene un reverso
  IF EXISTS (SELECT 1 FROM public.inventory_transactions WHERE reverses_id = p_transaction_id_a_revertir) THEN
    RAISE EXCEPTION 'La transacción % ya tiene un reverso registrado.', p_transaction_id_a_revertir;
  END IF;

  -- Verificar si la transacción pertenece a un periodo contable cerrado
  IF EXISTS (
    SELECT 1 FROM public.inventory_periods
    WHERE v_original.transaction_date::date BETWEEN start_date AND end_date
      AND status = 'CERRADO'
  ) THEN
    RAISE EXCEPTION 'OPERACIÓN DENEGADA: La transacción original pertenece a un periodo contable cerrado y no puede ser revertida.';
  END IF;

  -- Insertar el reverso con cantidad opuesta
  INSERT INTO public.inventory_transactions (
    material_id, transaction_date, transaction_type,
    quantity, expected_quantity, actual_quantity,
    unit_cost, reference_doc, destination_data,
    reverses_id, created_by, audit_note
  ) VALUES (
    v_original.material_id,
    NOW(),
    'REVERSAL',
    -v_original.quantity,   -- Cantidad opuesta para neutralizar el efecto
    v_original.expected_quantity,
    v_original.actual_quantity,
    v_original.unit_cost,
    v_original.reference_doc,
    v_original.destination_data,
    p_transaction_id_a_revertir,
    p_created_by,
    FORMAT('REVERSO AUTORIZADO. Transacción original: %s. Motivo: %s', p_transaction_id_a_revertir, p_motivo)
  )
  RETURNING id INTO v_reverso_id;

  RETURN jsonb_build_object(
    'success',          true,
    'reverso_id',       v_reverso_id,
    'original_id',      p_transaction_id_a_revertir,
    'cantidad_revertida', v_original.quantity
  );
END;
$$;


-- ============================================================
-- SECCIÓN 6: SNAPSHOT DIARIO AUTOMÁTICO (pg_cron)
-- ============================================================

-- Eliminar el job anterior si existe (idempotente)
SELECT cron.unschedule('daily_inventory_snapshot') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily_inventory_snapshot'
);

-- Programar el snapshot diario a las 23:59 (hora UTC)
-- Ajustar el offset según la zona horaria de Venezuela (UTC-4 = 03:59 UTC del día siguiente)
SELECT cron.schedule(
  'daily_inventory_snapshot',
  '59 03 * * *',  -- 23:59 Venezuela (UTC-4)
  $$
  INSERT INTO public.inventory_snapshots (snapshot_date, material_id, stock_quantity, average_unit_cost, total_value)
  SELECT
    CURRENT_DATE,
    material_id,
    current_stock,
    average_unit_cost,
    total_value
  FROM public.materials_inventory
  WHERE is_active = TRUE
  ON CONFLICT (snapshot_date, material_id) DO UPDATE SET
    stock_quantity    = EXCLUDED.stock_quantity,
    average_unit_cost = EXCLUDED.average_unit_cost,
    total_value       = EXCLUDED.total_value;
  $$
);


-- ============================================================
-- SECCIÓN 7: COMENTARIOS DE DOCUMENTACIÓN EN LA DB
-- ============================================================
COMMENT ON TABLE  public.inventory_families          IS 'Catálogo de familias de inventario. Define prefijos para autogeneración de SKUs.';
COMMENT ON TABLE  public.materials_inventory         IS 'Tabla hija de materials. Almacena ítems habilitados para almacén con su CPP y stock actual.';
COMMENT ON TABLE  public.inventory_periods           IS 'Control de periodos contables. Un periodo CERRADO bloquea cualquier movimiento en esas fechas.';
COMMENT ON TABLE  public.inventory_transactions      IS 'KARDEX INMUTABLE. Solo INSERT permitido. Los errores se corrigen con transacciones REVERSAL.';
COMMENT ON TABLE  public.inventory_snapshots         IS 'Fotografía diaria del stock y costos. Se genera automáticamente a las 23:59 vía pg_cron.';
COMMENT ON COLUMN public.inventory_transactions.quantity          IS 'Positivo = entrada al almacén. Negativo = salida del almacén.';
COMMENT ON COLUMN public.inventory_transactions.expected_quantity IS 'Cantidad esperada (según guía del proveedor o receta teórica).';
COMMENT ON COLUMN public.inventory_transactions.actual_quantity   IS 'Cantidad real recibida o utilizada.';
COMMENT ON COLUMN public.inventory_transactions.stock_after       IS 'Snapshot del stock total DESPUÉS de aplicar esta transacción. Denormalizado para auditoría sin recálculo.';
COMMENT ON COLUMN public.inventory_transactions.avg_cost_after    IS 'Snapshot del CPP DESPUÉS de aplicar esta transacción.';
COMMENT ON COLUMN public.materials_inventory.average_unit_cost    IS 'Costo Promedio Ponderado (CPP) calculado automáticamente por trigger.';
