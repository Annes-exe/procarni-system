-- Migration: Add Credit Payment Terms to Service Orders, payment statuses, and Scheduled Due Date Alerts
-- Created at: 2026-07-01

-- 1. Add credit-related columns to service_orders
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Contado';
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS custom_payment_terms TEXT;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS credit_days INTEGER DEFAULT 0;

-- 2. Function to check upcoming payment due dates and generate reminder notifications
CREATE OR REPLACE FUNCTION public.check_payment_due_dates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    r RECORD;
    days_left INTEGER;
    user_rec RECORD;
    msg TEXT;
    title TEXT;
    due_date DATE;
BEGIN
    -- A. Process Purchase Orders
    FOR r IN 
        SELECT po.id, po.sequence_number, po.issue_date, po.credit_days, po.created_at, s.name as supplier_name
        FROM public.purchase_orders po
        JOIN public.suppliers s ON po.supplier_id = s.id
        WHERE po.status = 'ToPay' 
          AND po.payment_terms = 'Crédito' 
          AND po.credit_days IS NOT NULL 
          AND po.credit_days > 0 
          AND po.issue_date IS NOT NULL
    LOOP
        due_date := po.issue_date::DATE + po.credit_days;
        days_left := due_date - CURRENT_DATE;
        
        IF days_left IN (0, 1, 2, 5) THEN
            IF days_left = 0 THEN
                title := 'Vencimiento de Orden de Compra (Hoy)';
                msg := 'La Orden de Compra ' || COALESCE('OC-' || to_char(r.created_at, 'YYYY-MM-') || TO_CHAR(r.sequence_number, 'FM000'), r.id::text) || ' con ' || r.supplier_name || ' vence el día de hoy.';
            ELSIF days_left = 1 THEN
                title := 'Vencimiento de Orden de Compra (Mañana)';
                msg := 'La Orden de Compra ' || COALESCE('OC-' || to_char(r.created_at, 'YYYY-MM-') || TO_CHAR(r.sequence_number, 'FM000'), r.id::text) || ' con ' || r.supplier_name || ' vence mañana.';
            ELSE
                title := 'Vencimiento Próximo de Orden de Compra';
                msg := 'La Orden de Compra ' || COALESCE('OC-' || to_char(r.created_at, 'YYYY-MM-') || TO_CHAR(r.sequence_number, 'FM000'), r.id::text) || ' con ' || r.supplier_name || ' vence en ' || days_left || ' días.';
            END IF;
            
            -- Insert notifications for all active users
            FOR user_rec IN SELECT id FROM auth.users LOOP
                INSERT INTO public.notifications (user_id, title, message, type, resource_type, resource_id)
                VALUES (user_rec.id, title, msg, 'reminder', 'purchase_order', r.id);
            END LOOP;
        END IF;
    END LOOP;

    -- B. Process Service Orders
    FOR r IN 
        SELECT so.id, so.sequence_number, so.issue_date, so.credit_days, so.created_at, s.name as supplier_name
        FROM public.service_orders so
        JOIN public.suppliers s ON so.supplier_id = s.id
        WHERE so.status = 'ToPay' 
          AND so.payment_terms = 'Crédito' 
          AND so.credit_days IS NOT NULL 
          AND so.credit_days > 0 
          AND so.issue_date IS NOT NULL
    LOOP
        due_date := so.issue_date::DATE + so.credit_days;
        days_left := due_date - CURRENT_DATE;
        
        IF days_left IN (0, 1, 2, 5) THEN
            IF days_left = 0 THEN
                title := 'Vencimiento de Orden de Servicio (Hoy)';
                msg := 'La Orden de Servicio ' || COALESCE('OS-' || to_char(r.created_at, 'YYYY-MM-') || TO_CHAR(r.sequence_number, 'FM000'), r.id::text) || ' con ' || r.supplier_name || ' vence el día de hoy.';
            ELSIF days_left = 1 THEN
                title := 'Vencimiento de Orden de Servicio (Mañana)';
                msg := 'La Orden de Servicio ' || COALESCE('OS-' || to_char(r.created_at, 'YYYY-MM-') || TO_CHAR(r.sequence_number, 'FM000'), r.id::text) || ' con ' || r.supplier_name || ' vence mañana.';
            ELSE
                title := 'Vencimiento Próximo de Orden de Servicio';
                msg := 'La Orden de Servicio ' || COALESCE('OS-' || to_char(r.created_at, 'YYYY-MM-') || TO_CHAR(r.sequence_number, 'FM000'), r.id::text) || ' con ' || r.supplier_name || ' vence en ' || days_left || ' días.';
            END IF;
            
            -- Insert notifications for all active users
            FOR user_rec IN SELECT id FROM auth.users LOOP
                INSERT INTO public.notifications (user_id, title, message, type, resource_type, resource_id)
                VALUES (user_rec.id, title, msg, 'reminder', 'service_order', r.id);
            END LOOP;
        END IF;
    END LOOP;
END;
$$;

-- 3. Schedule the Cron Job for Daily Alerts at 8:00 AM UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payment-due-alerts') THEN
    PERFORM cron.unschedule('payment-due-alerts');
  END IF;
END $$;

SELECT cron.schedule(
    'payment-due-alerts',
    '0 8 * * *',
    'SELECT public.check_payment_due_dates()'
);
