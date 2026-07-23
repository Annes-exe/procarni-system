-- Migration: Optimización de Filtro de Materia Prima
-- Created: 2026-07-16

-- 1. Agregar columnas booleanas e índices
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_raw_material BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_suppliers_is_raw_material ON suppliers(is_raw_material);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS is_raw_material BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_is_raw_material ON purchase_orders(is_raw_material);

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS is_raw_material BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_quote_requests_is_raw_material ON quote_requests(is_raw_material);

-- 2. Migración Inicial de Datos Históricos
-- 2a. Actualizar proveedores según catálogo o histórico
UPDATE suppliers s
SET is_raw_material = EXISTS (
  SELECT 1 FROM supplier_materials sm
  JOIN materials m ON sm.material_id = m.id
  WHERE sm.supplier_id = s.id 
    AND m.category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
) OR EXISTS (
  SELECT 1 FROM purchase_orders po
  JOIN purchase_order_items poi ON poi.order_id = po.id
  JOIN materials m ON poi.material_id = m.id
  WHERE po.supplier_id = s.id 
    AND m.category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
) OR EXISTS (
  SELECT 1 FROM purchase_orders po
  JOIN purchase_order_items poi ON poi.order_id = po.id
  WHERE po.supplier_id = s.id 
    AND poi.material_name IN (
      SELECT name FROM materials WHERE category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
    )
);

-- 2b. Actualizar órdenes de compra
UPDATE purchase_orders po
SET is_raw_material = EXISTS (
  SELECT 1 FROM purchase_order_items poi
  LEFT JOIN materials m ON poi.material_id = m.id
  WHERE poi.order_id = po.id
    AND (
      m.category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
      OR poi.material_name IN (
        SELECT name FROM materials WHERE category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
      )
    )
);

-- 2c. Actualizar cotizaciones
UPDATE quote_requests qr
SET is_raw_material = EXISTS (
  SELECT 1 FROM quote_request_items qri
  LEFT JOIN materials m ON qri.material_id = m.id
  WHERE qri.request_id = qr.id
    AND (
      m.category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
      OR qri.material_name IN (
        SELECT name FROM materials WHERE category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
      )
    )
);

-- 3. Triggers de PostgreSQL para Mantenimiento Automático
-- 3a. Función y Trigger para Órdenes de Compra (items)
CREATE OR REPLACE FUNCTION check_po_raw_material_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_orders
  SET is_raw_material = EXISTS (
    SELECT 1 FROM purchase_order_items poi
    LEFT JOIN materials m ON poi.material_id = m.id
    WHERE poi.order_id = COALESCE(NEW.order_id, OLD.order_id)
      AND (
        m.category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
        OR poi.material_name IN (
          SELECT name FROM materials WHERE category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
        )
      )
  )
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_po_raw_material_status ON purchase_order_items;
CREATE TRIGGER trg_check_po_raw_material_status
AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
FOR EACH ROW EXECUTE FUNCTION check_po_raw_material_status();

-- 3b. Función y Trigger para Cotizaciones (items)
CREATE OR REPLACE FUNCTION check_qr_raw_material_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE quote_requests
  SET is_raw_material = EXISTS (
    SELECT 1 FROM quote_request_items qri
    LEFT JOIN materials m ON qri.material_id = m.id
    WHERE qri.request_id = COALESCE(NEW.request_id, OLD.request_id)
      AND (
        m.category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
        OR qri.material_name IN (
          SELECT name FROM materials WHERE category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
        )
      )
  )
  WHERE id = COALESCE(NEW.request_id, OLD.request_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_qr_raw_material_status ON quote_request_items;
CREATE TRIGGER trg_check_qr_raw_material_status
AFTER INSERT OR UPDATE OR DELETE ON quote_request_items
FOR EACH ROW EXECUTE FUNCTION check_qr_raw_material_status();

-- 3c. Función y Trigger para Proveedores (catálogo)
CREATE OR REPLACE FUNCTION check_supplier_raw_material_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE suppliers
  SET is_raw_material = EXISTS (
    SELECT 1 FROM supplier_materials sm
    JOIN materials m ON sm.material_id = m.id
    WHERE sm.supplier_id = COALESCE(NEW.supplier_id, OLD.supplier_id)
      AND m.category IN ('SECA', 'FRESCA', 'EMPAQUE', 'seca', 'fresca', 'empaque', 'Seca', 'Fresca', 'Empaque', 'SECAS', 'FRESCAS', 'EMPAQUES', 'secas', 'frescas', 'empaques', 'Secas', 'Frescas', 'Empaques')
  )
  WHERE id = COALESCE(NEW.supplier_id, OLD.supplier_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_supplier_raw_material_status ON supplier_materials;
CREATE TRIGGER trg_check_supplier_raw_material_status
AFTER INSERT OR UPDATE OR DELETE ON supplier_materials
FOR EACH ROW EXECUTE FUNCTION check_supplier_raw_material_status();
