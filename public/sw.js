
/* public/sw.js */
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = JSON.parse(event.data.text());
      const options = {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/notification.png',
        data: {
          url: data.url
        },
        vibrate: [100, 50, 100],
        actions: [
          { action: 'open', title: 'Open QIVO' }
        ]
      };
      event.waitUntil(self.registration.showNotification(data.title, options));
    } catch (e) {
      console.error("Push data parse error", e);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
