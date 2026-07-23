-- Migration: Pause CXP accumulation and revert existing ToPay / Credit orders to Approved
-- Date: 2026-07-23

BEGIN;

-- Revert Purchase Orders in ToPay or Credit status to Approved to pause CXP accumulation
UPDATE purchase_orders
SET status = 'Approved'
WHERE status IN ('ToPay', 'Credit');

-- Revert Service Orders in ToPay or Credit status to Approved to pause CXP accumulation
UPDATE service_orders
SET status = 'Approved'
WHERE status IN ('ToPay', 'Credit');

COMMIT;
