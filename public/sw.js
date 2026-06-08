
/**
 * @fileOverview QIVO Background Service Worker.
 * Handles background push notifications and deep linking.
 */

self.addEventListener('push', function(event) {
  if (event.data) {
    const payload = event.data.json();
    const options = {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/notification.png',
      vibrate: [100, 50, 100],
      data: {
        url: payload.url || '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(payload.title, options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
