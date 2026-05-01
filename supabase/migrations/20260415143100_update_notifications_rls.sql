-- Migration para relajar la restricción de inserción en notificaciones
-- Esto soluciona los errores 403 Forbidden cuando un Admin usa "acciones masivas"
-- y el sistema intenta enviar notificaciones a los creadores originales de las órdenes.

DROP POLICY IF EXISTS "Users can insert their own notifications" ON notifications;

CREATE POLICY "Authenticated users can insert notifications" ON notifications
FOR INSERT
TO authenticated
WITH CHECK (true);
