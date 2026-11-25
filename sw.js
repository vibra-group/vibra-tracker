// The VIBRA app has moved to Coscripta (23 Nov 2026). This worker replaces the old one once, empties every cache it
// kept, unregisters itself and reloads the open pages, so that the notice page is what a member sees.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll({ type: 'window' }); })
    .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); }));
});
