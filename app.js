/* VIBRA app (installable page on GitHub Pages). It holds no group data: it opens the tracker, pairs this device for
   notifications with a one-time code from the tracker, and keeps the owner's own manuscript list for offline reading. */
(function () {
  'use strict';
  var C = window.VIBRA || {};
  var ua = navigator.userAgent || '';
  var IOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var ANDROID = /Android/.test(ua);
  var SAFARI = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Edg\//.test(ua);
  var STANDALONE = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var S = { device: null, summary: null, news: [], busy: false, msg: null, installEvt: null };
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- small helpers */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k]; else if (k === 'cls') n.className = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function fill(node, kids) { node.textContent = ''; kids.forEach(function (k) { if (k) node.appendChild(k); }); }
  function kv(op, key, val) {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no storage'));
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
  function helperUrl() { return (S.device && S.device.helper) || C.helperUrl || ''; }
  function post(body) {
    return fetch(helperUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('The helper answered ' + r.status + '.'); return r.json(); });
  }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64ToU8(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var raw = atob(s), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nice(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return (+p[2]) + ' ' + MON[+p[1] - 1] + (String(iso).length > 10 ? ' ' + String(iso).slice(11, 16) : ''); }
  function days(iso, today) { return Math.round((Date.parse(String(iso).slice(0, 10)) - Date.parse(String(today).slice(0, 10))) / 86400000); }
  function deviceLabel() { return IOS ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : ANDROID ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Computer'; }

  /* ---------- views */
  function renderOpen() {
    var a = $('open');
    a.href = C.trackerUrl || '#';
    $('open-hint').textContent = !navigator.onLine ? 'You are offline: the tracker needs a connection. Your own list below is the copy from the last sync.' :
      STANDALONE && IOS ? 'The tracker opens inside VIBRA; tap Done at the top to come back here.' :
      STANDALONE ? 'The tracker opens in this window; use Back to return here.' : '';
  }
  function renderInstall() {
    var box = $('install'), body = $('install-body');
    if (STANDALONE) { box.hidden = true; return; }
    box.hidden = false;
    var steps;
    if (IOS && !SAFARI) steps = ['Open this page in Safari (copy the address, paste it in Safari).', 'Tap Share, then Add to Home Screen.', 'Open VIBRA from the Home Screen.'];
    else if (IOS) steps = ['Tap the Share button at the bottom of Safari.', 'Choose Add to Home Screen, then Add.', 'Open VIBRA from the Home Screen: notifications work from there.'];
    else if (ANDROID) steps = ['Tap Install VIBRA below, or the browser menu, then Install app or Add to Home screen.', 'Open VIBRA from the home screen.'];
    else if (SAFARI) steps = ['In Safari: File, Add to Dock.', 'Open VIBRA from the Dock.'];
    else steps = ['Click Install VIBRA below, or the install icon at the right of the address bar (Chrome, Edge).', 'VIBRA then opens in its own window, with its own icon.'];
    fill(body, [el('ol', { cls: 'steps' }, steps.map(function (t) { return el('li', { text: t }); }))]);
    $('install-btn').hidden = !S.installEvt;
  }
  function renderNotif() {
    var body = $('notif-body'), kids = [];
    if (S.msg) kids.push(el('p', { cls: 'msg' + (S.msg.err ? ' err' : ' ok'), role: S.msg.err ? 'alert' : 'status', text: S.msg.text }));
    if (S.device) {
      kids.push(el('p', { style: 'margin:0', text: 'On for ' + (S.device.member || 'you') + ' on this ' + (S.device.label || 'device') + '. You are told when the ball comes to you or a manuscript you are on changes, as chosen in the tracker (My account).' }));
      kids.push(el('div', { cls: 'row' }, [
        el('button', { cls: 'btn small', type: 'button', text: 'Send a test', onclick: test }),
        el('button', { cls: 'btn small', type: 'button', text: 'Turn off', onclick: off })]));
    } else if (!PUSH_OK) {
      kids.push(el('p', { style: 'margin:0', text: IOS && !STANDALONE ? 'On iPhone and iPad, notifications work once VIBRA is on the Home Screen (iOS 16.4 or later): see Install VIBRA above, then open VIBRA from the Home Screen.' :
        'This browser cannot receive notifications. Chrome, Edge, Firefox or Safari can.' }));
    } else if (!helperUrl()) {
      kids.push(el('p', { style: 'margin:0', text: 'Notifications are being switched on by the admin. Come back to this page in a little while.' }));
    } else if (Notification.permission === 'denied') {
      kids.push(el('p', { style: 'margin:0', text: 'Notifications are blocked for VIBRA. Allow them in the settings of this device (or of the browser for this site), then reload this page.' }));
    } else {
      var input = el('input', { id: 'code', cls: 'code', type: 'text', inputmode: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false', maxlength: '9', placeholder: 'ABCD-EFGH', 'aria-describedby': 'code-hint' });
      input.value = S.prefill || '';
      kids.push(el('p', { style: 'margin:0', text: 'Get a one-time code in the tracker (My account, box "VIBRA app on your phone and computer"), type it here, and allow notifications.' }));
      kids.push(el('label', { cls: 'lbl', for: 'code', text: 'Pairing code' }));
      kids.push(input);
      kids.push(el('p', { cls: 'hint', id: 'code-hint', text: 'The code is valid 30 minutes and pairs this one device with your tracker account.' }));
      kids.push(el('div', { cls: 'row' }, [el('button', { cls: 'btn primary', type: 'button', id: 'pair', text: S.busy ? 'Turning on…' : 'Turn on notifications', onclick: pair })]));
      if (S.busy) kids[kids.length - 1].firstChild.setAttribute('disabled', '');
    }
    fill(body, kids);
  }
  function renderMine() {
    var sm = S.summary, box = $('mine');
    box.hidden = !sm;
    if (!sm) return;
    $('mine-asof').textContent = (navigator.onLine ? 'Updated ' : 'Offline copy from ') + nice(sm.updated) + ' (Vietnam time). ' + sm.items.length + ' open manuscript' + (sm.items.length === 1 ? '' : 's') + ' where you have the ball or are an author.';
    fill($('mine-list'), sm.items.length ? sm.items.map(function (m) {
      var chips = [];
      if (m.deadline) { var d = days(m.deadline, sm.today); chips.push(el('span', { cls: 'chip' + (d < 0 ? ' due' : d <= 7 ? ' soon' : ''), text: d < 0 ? 'Overdue ' + (-d) + ' d' : d === 0 ? 'Due today' : 'Due in ' + d + ' d · ' + nice(m.deadline) })); }
      chips.push(el('span', { cls: 'chip', text: m.mine === 'ball' ? 'Ball with you' : 'Author' }));
      var next = m.next ? (m.next.length > 140 ? el('details', { cls: 'next' }, [el('summary', { text: m.next.split('\n')[0].slice(0, 120) + '…' }), el('div', { text: m.next })]) : el('div', { cls: 'next', text: m.next })) : null;
      return el('li', {}, [el('div', { cls: 'meta' }, chips), el('div', { cls: 't', text: '#' + m.id + ' ' + m.title }),
        el('div', { cls: 'meta', text: [m.status, m.stage, m.journal].filter(Boolean).join(' · ') + (m.ball ? ' · Ball: ' + m.ball : '') }), next]);
    }) : [el('li', { cls: 'muted', text: 'Nothing open for you right now.' })]);
  }
  function renderNews() {
    var seen = {}, list = (S.news || []).concat((S.summary && S.summary.news) || []).filter(function (n) {
      var k = (n.id || '') + '|' + n.ts + '|' + n.text; if (seen[k] || seen[n.text + n.ts]) return false; seen[k] = 1; seen[n.text + n.ts] = 1; return true;
    }).sort(function (a, b) { return String(a.ts) < String(b.ts) ? 1 : -1; }).slice(0, 12);
    $('news').hidden = !list.length;
    fill($('news-list'), list.map(function (n) { return el('li', {}, [el('div', { cls: 'meta', text: nice(n.ts) }), el('div', { text: n.text })]); }));
  }
  function render() {
    var net = $('net'); net.textContent = navigator.onLine ? 'Online' : 'Offline'; net.className = 'net' + (navigator.onLine ? '' : ' off');
    renderOpen(); renderInstall(); renderNotif(); renderMine(); renderNews();
    $('foot').textContent = 'VIBRA app ' + (C.version || '') + '. This page holds no group data; it keeps only your own manuscript list on this device, for offline reading. Turning notifications off removes it.';
  }

  /* ---------- actions */
  function say(text, err) { S.msg = { text: text, err: !!err }; render(); }
  function pair() {
    var code = String(($('code') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 8) return say('Type the 8-character code shown in the tracker (for example ABCD-EFGH).', true);
    if (!helperUrl()) return say('Notifications are not switched on yet.', true);
    S.busy = true; S.msg = null; render();
    var dev = rand(18), k = rand(32), vapid = '';
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Notifications were not allowed. Allow them for VIBRA, then try again.');
      return fetch(helperUrl() + '?action=config', { credentials: 'omit', cache: 'no-store' }).then(function (r) { return r.json(); });
    }).then(function (cfg) {
      vapid = cfg && cfg.vapid; if (!vapid) throw new Error('The helper is not ready for notifications yet.');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (old) { return old ? old.unsubscribe() : null; }).then(function () {
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vapid) });
      });
    }).then(function (sub) {
      return post({ action: 'subscribe', code: code, dev: dev, k: k, sub: sub.toJSON(), label: deviceLabel() }).then(function (r) {
        if (!r.ok) { sub.unsubscribe(); throw new Error(r.error || 'Pairing failed.'); }
        S.device = { dev: dev, k: k, helper: helperUrl(), vapid: vapid, member: r.member, label: deviceLabel() };
        return kv('set', 'device', S.device);
      });
    }).then(function () {
      S.busy = false; S.prefill = ''; history.replaceState(null, '', location.pathname);
      say('Notifications are on. A test is on its way.');
      return post({ action: 'test', dev: S.device.dev, k: S.device.k }).catch(function () { });
    }).then(sync).catch(function (e) { S.busy = false; say(String(e && e.message || e), true); });
  }
  function test() {
    post({ action: 'test', dev: S.device.dev, k: S.device.k }).then(function (r) {
      if (r && r.error === 'unknown device') return forget('This device is no longer paired (the push service ended the subscription). Pair it again.');
      say(r && r.ok ? 'Test sent. It should arrive in a few seconds.' : 'The test could not be sent (' + ((r && (r.result || r.error)) || 'no answer') + ').', !(r && r.ok));
    }).catch(function (e) { say('No connection to the helper: ' + e.message, true); });
  }
  function off() {
    var d = S.device;
    post({ action: 'unsubscribe', dev: d.dev, k: d.k }).catch(function () { }).then(function () {
      return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { return s && s.unsubscribe(); }).catch(function () { });
    }).then(function () { forget('Notifications are off on this device, and your offline list was removed.'); });
  }
  function forget(text) {
    S.device = null; S.summary = null; S.news = [];
    Promise.all([kv('del', 'device'), kv('del', 'summary'), kv('del', 'news')]).catch(function () { }).then(function () { say(text, false); });
  }
  function sync() {
    if (!S.device || !navigator.onLine) return Promise.resolve();
    return post({ action: 'summary', dev: S.device.dev, k: S.device.k }).then(function (r) {
      if (r && r.ok) { S.summary = r; if (r.member) S.device.member = r.member; return kv('set', 'summary', r).then(render); }
      if (r && r.error === 'unknown device') forget('This device is no longer paired. Pair it again with a new code from the tracker.');
    }).catch(function () { render(); });
  }

  /* ---------- start */
  var m = /[#&]pair=([A-Za-z0-9-]{8,9})/.exec(location.hash || '');
  if (m) S.prefill = m[1].toUpperCase();
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; render(); });
  window.addEventListener('appinstalled', function () { S.installEvt = null; render(); });
  $('install-btn').addEventListener('click', function () { if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; render(); } });
  $('refresh').addEventListener('click', function () { sync(); });
  window.addEventListener('online', function () { render(); sync(); });
  window.addEventListener('offline', render);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { load().then(sync); } });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () { });
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'refresh') load().then(sync); });
  }
  function load() {
    return Promise.all([kv('get', 'device'), kv('get', 'summary'), kv('get', 'news')]).then(function (v) {
      S.device = v[0] || null; S.summary = v[1] || null; S.news = v[2] || []; render();
    }).catch(function () { render(); });
  }
  render();
  load().then(sync);
})();
