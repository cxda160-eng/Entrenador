// Mi Entrenador — service worker: funciona sin conexión y avisa cuando termina el descanso
const VERSION = 'entrenador-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // La página: primero la red (para recibir actualizaciones), si no hay conexión la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Íconos, manifest y tipografías: primero la copia guardada
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
      return r;
    })));
  }
});

/* ---------- Aviso de fin de descanso ----------
   La página manda {type:'timer', end, label} al empezar el descanso y {type:'timer-cancel'} al saltarlo.
   Si al terminar la app no está a la vista (pantalla bloqueada u otra app), se muestra una notificación. */
let timerId = 0;
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'timer-cancel') { timerId++; return; }
  if (d.type !== 'timer') return;
  const id = ++timerId;
  const wait = Math.max(0, Math.min(d.end - Date.now(), 4.5 * 60 * 1000));
  e.waitUntil(new Promise(r => setTimeout(r, wait)).then(async () => {
    if (id !== timerId) return;
    if (!d.force) {
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (cs.some(c => c.visibilityState === 'visible')) return;  // la app está abierta: ya suena el pitido
    }
    return self.registration.showNotification('¡Ya! Terminó el descanso', {
      body: d.label ? 'Próxima serie de ' + String(d.label).toLowerCase() : 'A la próxima serie',
      tag: 'descanso', renotify: true, vibrate: [300, 120, 300, 120, 300],
      icon: 'icon-192.png', badge: 'icon-192.png', requireInteraction: false
    });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
