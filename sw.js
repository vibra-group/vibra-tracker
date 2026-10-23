/* VIBRA app service worker (2.0.0: the tracker itself is the app, at ./app/): works offline, receives notifications.
   2.2.0: the app page opens from this device at once and is refreshed in the background; when a newer page arrived,
   open windows are told ("New version · Reload") and the next opening uses it.
   2.3.0: a push also sets the number on the app icon (badge) and tells open windows to fetch the news at once.
   2.4.0: the new VIBRA app icons (app-*.png).
   2.5.0: page 0.2.5 (one-call quick updates through the helper, undo in one go, links, preprint).
   A push carries no content: on each push the worker asks the admin's helper for the text, with this device's
   own secret, and shows it. Nothing else leaves the device. */
var CACHE = 'vibra-app-2.5.0';
var SHELL = ['./', './app/', './manifest.webmanifest', './icons/app-192.png', './icons/app-512.png', './icons/app-maskable-512.png',
  './icons/app-apple-180.png', './icons/app-badge-96.png', './icons/app-favicon-32.png', './icons/vibra-logo-full.jpg'];
var LABEL = { nudge: 'Nudge', ball_to_you: 'Ball to you', changed: 'Manuscript changed', ai_update: 'AI update', inbox_reply: 'Quick update', deadline: 'Deadline',
  delete_request: 'Deletion request', delete_reply: 'Deletion', feedback_reply: 'App feedback', inbox: 'Quick update', test: 'VIBRA Tracker' };

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // 2.2.0: the copy kept on this device first (each page under its own address, without its ?query), refreshed from the
    // network in the background; with no copy yet, the network (and the app page as the offline fallback)
    var key = url.origin + url.pathname.replace(/index\.html$/, '');
    var fresh = fetch(url.origin + url.pathname, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return r;
      var keep = r.clone(), look = r.clone();
      return caches.open(CACHE).then(function (x) {
        return x.match(key).then(function (old) {
          return Promise.all([old ? old.text() : Promise.resolve(null), look.text()]).then(function (t) {
            return x.put(key, keep).then(function () { if (t[0] !== null && t[0] !== t[1]) tellNewVersion(); });
          });
        });
      }).then(function () { return r; });
    });
    e.respondWith(caches.match(key).then(function (hit) {
      if (hit) { e.waitUntil(fresh.catch(function () { })); return hit; }
      return fresh.catch(function () { return caches.match('./app/').then(function (r) { return r || Response.error(); }); });
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(req).then(function (r) {
      if (r.ok) { var c = r.clone(); caches.open(CACHE).then(function (x) { x.put(req, c); }); }
      return r;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});

function tellNewVersion() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: 'update' }); }); });
}

/* tiny key-value store shared with the page (IndexedDB "vibra") */
function kv(op, key, val) {
  return new Promise(function (res, rej) {
    var o = indexedDB.open('vibra', 1);
    o.onupgradeneeded = function () { o.result.createObjectStore('kv'); };
    o.onerror = function () { rej(o.error); };
    o.onsuccess = function () {
      var tx = o.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
      var r = op === 'get' ? st.get(key) : op === 'set' ? st.put(val, key) : st.delete(key);
      tx.oncomplete = function () { res(r.result); o.result.close(); };
      tx.onerror = function () { rej(tx.error); };
    };
  });
}
function post(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' })
    .then(function (r) { return r.json(); });
}
function b64ToU8(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  var raw = atob(s), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
}

self.addEventListener('push', function (e) { e.waitUntil(onPush()); });
function onPush() {
  var opts = { icon: './icons/app-192.png', badge: './icons/app-badge-96.png' };
  return kv('get', 'device').catch(function () { return null; }).then(function (d) {
    if (!d || !d.helper) return { items: [], more: 0 };
    return post(d.helper, { action: 'pending', dev: d.dev, k: d.k }).then(function (j) { return j && j.ok ? j : { items: [], more: 0 }; })
      .catch(function () { return { items: [], more: 0 }; });
  }).then(function (j) {
    var items = j.items || [];
    // 0.2.3: the number on the app icon, and an open VIBRA window fetches the news at once
    try { if (typeof j.unread === 'number' && self.navigator && self.navigator.setAppBadge) (j.unread ? self.navigator.setAppBadge(j.unread) : self.navigator.clearAppBadge()).catch(function () { }); } catch (x) { }
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: 'news' }); }); }).catch(function () { });
    if (!items.length) {
      // a push must always show something (browsers stop delivering otherwise)
      return self.registration.showNotification('VIBRA Tracker', Object.assign({ body: 'Something changed on one of your manuscripts. Open VIBRA to see it.', tag: 'vibra-generic', data: { url: './app/' } }, opts));
    }
    return Promise.resolve().then(function () {
      var shown = items.slice(0, 3).map(function (n) {
        return self.registration.showNotification(LABEL[n.kind] || 'VIBRA Tracker', Object.assign({ body: n.text, tag: 'vibra-' + n.id, data: { url: n.mid ? './app/?m=' + encodeURIComponent(n.mid) : './app/', m: Number(n.mid) || 0 } }, opts));
      });
      var extra = Math.max(0, items.length - 3) + (j.more || 0);
      if (extra) shown.push(self.registration.showNotification('VIBRA Tracker', Object.assign({ body: 'and ' + extra + ' more update' + (extra > 1 ? 's' : '') + '.', tag: 'vibra-more', data: { url: './app/' } }, opts)));
      return Promise.all(shown);
    });
  });
}

/* a click opens VIBRA on the manuscript the notification is about (an open VIBRA window is focused and told) */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {}, target = new URL(data.url || './app/', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cs[i]) { cs[i].postMessage({ type: 'open', m: data.m || 0 }); return cs[i].focus(); }
    }
    return self.clients.openWindow(target);
  }));
});

/* the browser renewed the subscription: tell the helper, with this device's own secret (no code needed) */
self.addEventListener('pushsubscriptionchange', function (e) {
  e.waitUntil(kv('get', 'device').then(function (d) {
    if (!d || !d.vapid) return;
    return self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(d.vapid) }).then(function (sub) {
      return post(d.helper, { action: 'subscribe', dev: d.dev, k: d.k, sub: sub.toJSON(), label: d.label });
    });
  }).catch(function () { }));
});
