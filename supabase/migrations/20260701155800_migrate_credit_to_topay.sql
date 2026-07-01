-- Migration: Migrate existing Credit status orders to ToPay status
-- Created at: 2026-07-01

UPDATE public.purchase_orders SET status = 'ToPay' WHERE status = 'Credit';
UPDATE public.service_orders SET status = 'ToPay' WHERE status = 'Credit';
