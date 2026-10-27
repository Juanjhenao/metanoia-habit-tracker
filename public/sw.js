/* Service worker de Metanoia.
   Su único trabajo es enseñar la notificación cuando llega un push, incluso con
   la app cerrada. No cachea nada a propósito: esto vive en la red de casa, el
   servidor está a un metro y una copia vieja de la app sería peor que ninguna
   —enseñaría una tabla de la casa que ya no es la que hay—. */

self.addEventListener('install', (e) => {
  // Sin esto, un service worker nuevo se queda esperando a que cierren todas
  // las pestañas viejas, y en un móvil eso puede ser nunca.
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (e) => {
  let datos = { titulo: 'Metanoia', texto: 'Algo se movió en la casa' };
  try {
    if (e.data) datos = { ...datos, ...e.data.json() };
  } catch (err) {
    // Un push sin JSON dentro: se enseña el texto por defecto antes que nada.
  }

  e.waitUntil((async () => {
    await self.registration.showNotification(datos.titulo, {
      body: datos.texto,
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      // Un tag fijo hace que los avisos seguidos se reemplacen en vez de
      // apilarse: en el móvil, cinco notificaciones iguales son ruido.
      tag: 'metanoia',
      renotify: true,
      data: { url: '/' },
    });

    // Y se le cuenta a la app que esto llegó. Desde una página no hay forma de
    // saber si el sistema llegó a pintar el aviso —Windows puede tener los
    // avisos del navegador apagados y tragarse el aviso sin rechistar— pero sí
    // de saber si el mensaje entró en el navegador. Es la diferencia entre «no
    // llegó» y «llegó y no lo viste», que son dos averías distintas y se
    // arreglan en sitios distintos.
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cliente of abiertas) {
      cliente.postMessage({ metanoia: 'push-recibido', texto: datos.texto, cuando: Date.now() });
    }
  })());
});

// Tocar la notificación trae la app al frente si ya estaba abierta, y solo
// abre una pestaña nueva si no había ninguna.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const cliente of abiertas) {
      if ('focus' in cliente) return cliente.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('/');
    return null;
  })());
});
