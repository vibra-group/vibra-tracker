# VIBRA app

The installable companion of the VIBRA Tracker (the research group's manuscript tracker).
It holds no group data. Installed on a computer or an Android phone it shows the tracker itself, full window
(since 1.1.0); in a browser tab, on iPhone and iPad, or offline it shows the app page. It receives notifications
for paired devices and keeps the owner's own manuscript list on the device for offline reading.

- `index.html`, `app.js`: the tracker in a frame with a splash (installed app), and the app page (install help,
  pairing with a one-time code from the tracker, offline list). The framed tracker turns notifications on through
  a few `postMessage` messages (origins checked on both sides).
- `sw.js`: service worker (offline copy of this page, notifications). Pushes carry no content: the worker
  asks the admin's helper for the text with the device's own secret.
- `config.js`: public addresses of the tracker and of the admin helper.
- `manifest.webmanifest`, `icons/`: name, colours and VIBRA icons.

Source and documentation: `FPP_VIBRA/_tracker_app/pwa` and `OPERATIONS.md` section 7 in the group's Drive.
