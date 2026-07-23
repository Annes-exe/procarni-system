-- Migration: Limpieza del Kardex e historial de pagos de prueba para producción
-- Fecha: 2026-07-23
-- Descripción: Elimina los registros del historial de pagos (payment_transactions) 
-- y reinicia los montos pagados (paid_amount) en órdenes de compra y servicios.

BEGIN;

-- 1. Vaciar la tabla de transacciones de pago del Kardex
TRUNCATE TABLE payment_transactions RESTART IDENTITY CASCADE;

-- 2. Reiniciar el monto pagado (paid_amount) en órdenes de compra a 0
UPDATE purchase_orders
SET paid_amount = 0;

-- 3. Reiniciar el monto pagado (paid_amount) en órdenes de servicio a 0
UPDATE service_orders
SET paid_amount = 0;

COMMIT;
