# VIBRA Tracker (the app)

The VIBRA research group's manuscript tracker, on the group's own address. Since 2.0.0 the tracker itself is the
app: open it in any browser, or install it (computer, Android, iPhone or iPad) for its own window and icon.
The pages hold no group data: members sign in with Google (or with a one-time code made on a signed-in device),
and every request goes to the admin's helper, which checks the member and runs the tracker's own code.

- `app/index.html`: the tracker (built by `tools/build_web.py` from the tracker's `Index.html`), with the sign-in
  screen, installation and notifications for this device.
- `index.html`: the old address; it opens `app/` (an app installed from it before opens the new tracker).
- `sw.js`: service worker (the last copy of the page for offline use, notifications). Pushes carry no content:
  the worker asks the admin's helper for the text with the device's own secret.
- `manifest.webmanifest`, `icons/`: name, colours, VIBRA icons and the full VIBRA logo.

Source and documentation: `FPP_VIBRA/_tracker_app` (README, SPEC section 18, OPERATIONS sections 7 and 11).
