# Ghost-Drop

A stateless drag-and-drop "shelf." Drag a file onto it from a browser or
Explorer, then drag it back out into Premiere, Photoshop, Discord, anywhere —
Ghost-Drop owns the routing, the caching, and the cleanup. You never see a
save dialog and you never have to remember to delete the temp file
afterward.

This is the same category of utility as macOS tools like Yoink/Dropzone,
built from scratch for the spec you gave me, mapped 1:1 onto Electron's
native drag-and-drop APIs.

## Running it (development / testing)

```bash
npm install
npm start
```

Requires Node.js + npm. `npm install` pulls in Electron (~31).

## Building the real, shippable installer

See **`PRODUCTION-BUILD.md`** — two commands (`npm install` then
`npm run dist`) produce `release\GhostDrop-Setup-1.0.0.exe`, a single
file ready to sell. The `build` section already in `package.json` is the
full electron-builder config (Windows NSIS target, proper `.ico`, per-user
install, desktop + Start Menu shortcuts, clean uninstall).

## How the spec maps to the code

| Spec module | File |
|---|---|
| 1. UI Overlay | `modules/uiOverlay.js` + `renderer/index.html`, `renderer/style.css`, `renderer/renderer.js` |
| 2. OS Interceptor | `modules/osInterceptor.js` + the drag handlers in `renderer/renderer.js` |
| 3. Ghost Directory | `modules/ghostDirectory.js` |
| 4. Executioner | `modules/executioner.js`, wired in `main.js` |
| 5. First-launch tutorial | `modules/preferences.js` + `renderer/tutorial.*` |

**`main.js`** is the boot sequence: purge orphans → open a session → raise
the overlay → wire the interceptor → arm the exit hooks → stand up the
tray → show the tutorial once on first launch.

## v2 additions — the hover-expand shelf

The icon itself is unchanged in spirit: idle at ~20% opacity, lights up on
an external drag, shows a count badge once populated. What's new is what
happens when you genuinely hover your mouse over it (not drag a file onto
it — those are deliberately different gestures, handled separately in
`renderer.js` via `dragDepth` vs `isExpanded`):

- The window itself grows downward with a hand-rolled spring-eased
  animation (`animateOverlayHeight` in `modules/uiOverlay.js`) — there's no
  built-in animated `setBounds()` on Windows, so this steps the height
  across ~60fps `setInterval` ticks with an overshoot ease on the way open
  and a calm ease on the way closed.
- A frosted "liquid glass" panel fades/scales in underneath (CSS
  `backdrop-filter: blur()` + a soft top-edge highlight in `style.css`),
  listing every cached file.
- Click a row to select it (multi-select, no modifier key needed); drag the
  small grip icon to reorder the shelf; move the mouse away and it folds
  back down automatically after a short debounce so it doesn't flicker on
  every tiny mouse jitter.
- Dragging the main icon hands off your current selection (or everything,
  if nothing's selected) via the same native `startDrag()` mechanism as
  before. Dragging an individual row hands off just that one file.

All of this is genuinely invisible unless you go looking for it — the idle
icon looks identical to v1 until you actually hover or populate it.

## The first-launch tutorial

A separate small frameless card window (`renderer/tutorial.html/css/js`),
shown automatically once on first launch and reachable anytime after via
**tray icon → "Show tutorial."** Five short slides: what it is, drop-in,
drag-out, the hover shelf, done. "Seen" state is a one-line JSON flag in
`modules/preferences.js`, stored in Electron's standard per-user app-data
folder — separate from the Ghost Directory's temp cache, since whether
you've seen the tutorial has nothing to do with the zero-footprint promise
the rest of the app makes.

## The tray menu

Right-click the tray icon for: **Show/hide overlay**, **Show tutorial**,
**Support FlushTech** (opens your Lemon Squeezy tip page in the default
browser — no in-app payment flow, just a link), and **Quit Ghost-Drop**.

## A few implementation notes worth knowing

- **The overlay genuinely has no exit button**, per the spec. That means
  something has to be the sanctioned way to quit — I added a small **system
  tray icon** (right-click → "Quit Ghost-Drop") since killing an Electron
  process with no menu and no window controls otherwise means Task Manager,
  which skips the graceful exit hooks. The tray isn't part of "the UI
  overlay" module — it's separate plumbing needed to make the no-chrome
  design actually usable.
- **Outbound drag uses `webContents.startDrag()`**, Electron's real API for
  this — your spec's "tricking the target app via the clipboard data
  object" is functionally what this does, it just goes through the OS's
  native drag session (not the literal copy/paste clipboard) since that's
  the channel apps like Premiere actually watch for an incoming file drag.
- **Multi-file drag-out is best-effort.** Electron only *officially*
  supports starting a native drag with a single file (`file: path`).
  Passing an array (`files: [...]`) works on macOS but is undocumented and
  flakier on Windows — since your build target is Windows, I pass both, so
  it'll do the right thing where Windows supports it and fall back to "drag
  the first cached file" where it doesn't. If you only ever drop one file at
  a time, you'll never notice this limitation at all.
- **`File.path` is deprecated in modern Electron** (28+) for security
  reasons. The inbound side uses `webUtils.getPathForFile()` in the preload
  script instead — same result, just the current sanctioned way to resolve
  a dropped file's real OS path.
- **Orphan sweep is the actual zero-footprint guarantee.** A graceful
  `app.quit()` (via the tray) purges synchronously. A SIGKILL/Task-Manager
  "End Task" gives the process zero notice, so nothing can run in that
  case — but the next time Ghost-Drop launches, it scans `%TEMP%` for any
  `GhostDrop_*` folder and deletes it before doing anything else. I tested
  this path directly (simulated an orphaned folder, confirmed it gets wiped
  on next launch).
- **Window placement**: top-right corner of the primary display, 150×150,
  24px margin, `alwaysOnTop` at the `screen-saver` z-level so it stays above
  fullscreen apps on Windows too.

## Known rough edges (haven't been able to test on a real Windows box from here)

- `transparent: true` BrowserWindows occasionally render with a thin border
  artifact on some Windows/GPU driver combos — if you see that, the fix is
  usually `win.setBackgroundColor('#00000000')` plus disabling hardware
  acceleration for just this window. Flag it if you hit it and I'll patch it.
- I haven't been able to verify the native drag-out actually lands inside
  Premiere/Photoshop specifically from this environment (no GUI here to test
  with) — the API is the documented, correct one for this, but that's worth
  a real first-run check on your end before you trust it for a recording.
