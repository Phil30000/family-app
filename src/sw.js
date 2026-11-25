const SHELL = 'fa-shell-v3';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icon-180.png', '/manifest.webmanifest'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let title = 'Family App', body = 'Es gibt etwas Neues.', tag = 'family';
    try {
      const r = await fetch('/api/notify', { credentials: 'include', cache: 'no-store' });
      if (r.ok) { const d = await r.json(); title = d.title || title; body = d.body || body; tag = d.tag || tag; }
    } catch (x) {}
    try { for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage('pull'); } catch (x) {}
    await self.registration.showNotification(title, { body, icon: '/icon-180.png', badge: '/icon-180.png', tag, data: { url: '/' } });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('/');
  })());
});
// App-Hülle: erst Netz, ohne Netz aus dem Speicher (damit die Einkaufsliste im Laden aufgeht)
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r.ok && (u.pathname === '/' || u.pathname.startsWith('/icon'))) { const c = await caches.open(SHELL); c.put(u.pathname === '/' ? '/' : e.request, r.clone()); }
      return r;
    } catch (x) {
      const c = await caches.match(u.pathname === '/index.html' ? '/' : e.request, { ignoreSearch: true });
      return c || caches.match('/') || Response.error();
    }
  })());
});
