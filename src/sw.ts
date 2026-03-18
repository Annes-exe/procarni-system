/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope;

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

// Precarga y ruteo automático de assets generado por vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// Limpiar cachés antiguas y tomar control de clientes inmediatamente
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

// --- Lógica de Notificaciones Push ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'Nueva Notificación';
    const options: NotificationOptions = {
      body: data.body || '',
      icon: data.icon || '/pwa-192x192.png',
      badge: data.badge || '/favicon.ico',
      data: data.data || {},
      vibrate: data.vibrate || [100, 50, 100],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error al parsear datos de evento push:', err);
    // Fallback por si no es JSON
    event.waitUntil(
      self.registration.showNotification('Notificación', {
        body: event.data.text(),
        icon: '/pwa-192x192.png',
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // URL a la que ir cuando se hace click. Por defecto a la raíz
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si la ventana ya está abierta, enfocamos
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrimos una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
