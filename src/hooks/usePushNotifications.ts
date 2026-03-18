import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';

// Esta llave debe ser publica.
const VAPID_PUBLIC_KEY = 'BOP4U1okKF9-J6_YkUgQaCtCnNgtK8E8RemK63_y8khTl_46h1hbx_uF5PcSnK2IKKBDuAf9nqYSlBf5ue55wfE';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState(Notification.permission);
  const [isSupported, setIsSupported] = useState(false);
  const { session } = useSession();

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] ServiceWorker ready', registration);
      const subscription = await registration.pushManager.getSubscription();
      console.log('[Push] Current subscription:', subscription);
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error al revisar la suscripción push:', error);
    }
  };

  const subscribe = useCallback(async () => {
    if (!isSupported || !session?.user) return;

    try {
      const p = await Notification.requestPermission();
      setPermission(p);

      if (p !== 'granted') {
        console.warn('Permiso de notificaciones denegado.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] Subscribing via Registration:', registration);
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        console.log('[Push] Generating new subscription...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }
      console.log('[Push] New/Existing subscription:', subscription);

      setIsSubscribed(true);

      // Guardar en Supabase
      const subscriptionJSON = subscription.toJSON();
      if (!subscriptionJSON.endpoint || !subscriptionJSON.keys?.auth || !subscriptionJSON.keys?.p256dh) {
        throw new Error("Invalid subscription object");
      }

      const { error } = await supabase
        .from('user_push_subscriptions')
        .upsert({
          user_id: session.user.id,
          endpoint: subscriptionJSON.endpoint,
          auth_key: subscriptionJSON.keys.auth,
          p256dh_key: subscriptionJSON.keys.p256dh,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, endpoint' });

      if (error) {
        console.error('Error guardando la suscripción en la base de datos:', error);
      }

      return subscription;
    } catch (error) {
      console.error('Error suscribiendo a notificaciones push:', error);
      throw error;
    }
  }, [isSupported, session]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !session?.user) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        setIsSubscribed(false);

        // Opcional: Borrar de Supabase
        await supabase.from('user_push_subscriptions').delete().match({
          user_id: session.user.id,
          endpoint: subscription.endpoint
        });
      }
    } catch (e) {
      console.error("Error unsubscribing", e);
    }
  }, [isSupported, session]);

  return {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe
  };
}
