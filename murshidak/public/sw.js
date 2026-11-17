// Murshidak service worker: shows push notifications and opens the right screen on tap.
// It deliberately does not cache pages, so the app is always the latest version.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'مرشدك', body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'مرشدك', {
    body: data.body || '', icon: '/icon.svg', badge: '/icon.svg', dir: 'auto', lang: 'ar',
    data: { url: data.url || '/#/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) { await open.focus(); return open.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
