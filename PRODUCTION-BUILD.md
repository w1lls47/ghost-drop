# Building the production installer (do this on your Windows PC)

Electron's binary has to be downloaded from GitHub during `npm install`, and
that download is blocked from the sandbox I built this in — so this exact
step needs to run on your machine, where you have normal internet access.
Everything else (all the app code, the icon, the installer config) is
already done and sitting in this folder.

## What's new in this build vs. the original

- Hover-to-expand file shelf with a liquid-glass panel, multi-select, and
  drag-to-reorder (all in `renderer/renderer.js` + `modules/uiOverlay.js`)
- First-launch tutorial card (`renderer/tutorial.*`), re-openable from the
  tray any time, including for your own testing — you don't need to
  reinstall to see it again, just click "Show tutorial."
- A quiet **Support FlushTech** link in the tray menu pointing at your
  Lemon Squeezy tip page. No popups, no nags — it just sits in the
  right-click menu like the other items.

No new dependencies were added for any of this — it's all built on the
same Electron APIs already in use, so the build commands below are
unchanged.

## One-time setup

If you haven't already from testing:
1. Install Node.js LTS from nodejs.org
2. Extract this zip somewhere normal, e.g. `Documents\GhostDrop`

## Build the installer

Open a terminal **inside the `ghost-drop` folder** and run exactly these two
commands:

```
npm install
npm run dist
```

`npm install` this time will also pull in `electron-builder` (a few hundred
MB more than before — this is the packaging tool, it's normal for it to take
a few minutes). `npm run dist` does the actual packaging: it bundles
Electron + your code into a single installer.

## Where the output lands

```
ghost-drop\release\GhostDrop-Setup-1.0.0.exe
```

That `.exe` is the entire product — one file, ready to send to a buyer or
upload to Lemon Squeezy. Everything else in `release\` (a `win-unpacked`
folder etc.) is just build scaffolding — ignore it, only the `Setup-*.exe`
matters.

## Test the installer itself (separate from testing the app)

This is testing the *installer experience*, which is different from testing
the app — a buyer never sees `npm start`, they only ever see this:

1. Double-click `GhostDrop-Setup-1.0.0.exe`
2. **You will almost certainly see a Windows SmartScreen warning** —
   "Windows protected your PC" / "Unknown publisher." This is expected and
   normal for any installer that isn't code-signed (code signing certs cost
   $100–400/year and aren't worth it yet at this product's price point).
   Click **More info → Run anyway**.
3. It should install with no further prompts (one-click installer, no admin
   required since it installs per-user)
4. Confirm a desktop shortcut and Start Menu entry named "Ghost-Drop" both
   appeared
5. Launch it from the shortcut (not from the terminal this time) — run
   through the same checklist from before: idle/hover/populated states,
   drop a file, check it lands in `%temp%\GhostDrop_*`, drag it into
   Premiere/Photoshop, quit via the tray, confirm the temp folder is gone
6. Go to **Settings → Apps → Installed apps**, find "Ghost-Drop," uninstall
   it, confirm it's fully gone (shortcuts removed, no leftover folder)

If all of that holds up, this exact `.exe` is what you ship.

## The SmartScreen warning and your buyers

Worth deciding now, before launch: that "Unknown publisher" screen is the
single biggest thing that could make a non-technical buyer bail mid-install.
Two options:

- **Cheapest**: add one line to your product page / delivery email —
  *"Windows will show a blue warning screen on first run, that's normal for
  small independent tools — click 'More info' then 'Run anyway.'"* You
  already write this kind of plain, non-technical instruction well from the
  Copilot Killer Pro README.
- **More polished, costs money**: buy a code-signing certificate. Probably
  not worth it yet at this price point and volume — revisit if this product
  takes off.

## Updating the product later

Bump the `"version"` field in `package.json` (e.g. `1.0.0` → `1.0.1`), then
run `npm run dist` again — the new installer filename will update to match
automatically.
