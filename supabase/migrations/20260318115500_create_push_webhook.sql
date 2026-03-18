CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.handle_new_notification_push()
RETURNS trigger AS $$
BEGIN
  -- Solo disparamos la funcion Edge si es un recordatorio
  IF NEW.type = 'reminder' THEN
    PERFORM net.http_post(
        url := 'https://hsspvhxneuetpatafdzy.supabase.co/functions/v1/send-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'type', 'INSERT',
          'table', 'notifications',
          'record', row_to_json(NEW),
          'schema', 'public'
        )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_push_notification ON public.notifications;
CREATE TRIGGER tr_push_notification
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_notification_push();
