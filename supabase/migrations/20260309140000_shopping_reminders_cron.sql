-- Habilitar la extensión pg_cron (requerida para programar tareas en Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 1. Crear la función que genera las notificaciones
CREATE OR REPLACE FUNCTION public.generate_shopping_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_dow INTEGER;
    current_day INTEGER;
    current_week INTEGER;
BEGIN
    current_dow := EXTRACT(DOW FROM NOW()); -- 0 (Domingo) a 6 (Sábado)
    current_day := EXTRACT(DAY FROM NOW());
    current_week := EXTRACT(WEEK FROM NOW());

    -- 1. Recordatorio Semanal: Todos los Lunes (1) y Martes (2)
    IF current_dow IN (1, 2) THEN
        INSERT INTO public.notifications (user_id, title, message, type, resource_type)
        SELECT id, 'Recordatorio de Compra: Semanal', 'Comprar: Café, Aceite, Pañitos Amarillos, Esponja doble uso', 'reminder', 'material'
        FROM auth.users;
    END IF;

    -- 2. Recordatorio Quincenal: Cada 15 días, Martes (2) y Miércoles (3)
    -- Usamos (week_number % 2 = 0) para simular "cada 15 días" (quincenal)
    IF current_dow IN (2, 3) AND (current_week % 2 = 0) THEN
        INSERT INTO public.notifications (user_id, title, message, type, resource_type)
        SELECT id, 'Recordatorio de Compra: Quincenal', 'Comprar: Granos, Bolsas', 'reminder', 'material'
        FROM auth.users;
    END IF;

    -- 3. Recordatorio Mensual: Todos los días 30 del mes
    IF current_day = 30 THEN
        INSERT INTO public.notifications (user_id, title, message, type, resource_type)
        SELECT id, 'Recordatorio de Compra: Mensual', 'Comprar: Envoplast, Papelería', 'reminder', 'material'
        FROM auth.users;
    END IF;
END;
$$;

-- 2. Asegurarse de quitar tareas previas si existen (para no duplicarlas al correr el script varias veces)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shopping-reminders') THEN
    PERFORM cron.unschedule('shopping-reminders');
  END IF;
END
$$;

-- 3. Programar la tarea para que corra todos los días a las 8:00 AM (hora del servidor/UTC)
SELECT cron.schedule(
    'shopping-reminders',
    '0 8 * * *',
    'SELECT public.generate_shopping_reminders()'
);
