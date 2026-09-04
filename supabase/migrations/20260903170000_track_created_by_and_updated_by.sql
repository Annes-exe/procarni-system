-- Migration to ensure created_by, updated_by, and updated_at exist across all document tables
-- Date: 2026-09-03

-- 1. purchase_orders
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. service_orders
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. quote_requests
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
