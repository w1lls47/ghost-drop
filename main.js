/**
 * GHOST-DROP — main process v1.2.1
 * ----------------------------------
 * Boot order is intentional:
 *
 *   1. Raise the overlay window FIRST — so the user sees it within ~300 ms
 *      of clicking the icon, before any heavy I/O has started. Perceived
 *      launch speed is the goal, not actual launch speed.
 *   2. Wire IPC channels immediately — renderer will be loading in parallel
 *      and may send messages before step 3 finishes.
 *   3. Arm exit hooks (no session dir yet, that comes in step 4).
 *   4. Stand up the tray.
 *   5. Run all async startup I/O in the background:
 *        purgeOrphans  → delete any %TEMP%\GhostDrop_* from a previous crash
 *        sweepOldShelf → delete shelf files older than 30 days, silently
 *        initSession   → create this run's temp staging directory
 *      Then tell the Executioner the session dir so it can purge it on exit.
 *   6. Show the tutorial on first ever launch.
 *   7. Check for updates silently in the background (electron-updater).
 */

const { app, ipcMain, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');

const ghostDirectory  = require('./modules/ghostDirectory');
const preferences     = require('./modules/preferences');
const { armExitHooks, setSessionDir } = require('./modules/executioner');
const { createOverlayWindow, createTutorialWindow, wireResizeChannel } = require('./modules/uiOverlay');
const { registerInterceptors } = require('./modules/osInterceptor');

const SUPPORT_URL = 'https://flushop.lemonsqueezy.com/checkout/buy/7ee734e4-2fe7-403e-bf67-162c00549ae6';

// ── Auto-updater ──────────────────────────────────────────────────────────────
// Only active in a packaged build — dev mode skips it entirely.
let autoUpdater = null;
let updateAvailable = false;

if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = true;        // Download silently in background
    autoUpdater.autoInstallOnAppQuit = true; // Install when user quits normally

    autoUpdater.on('update-available', () => {
      updateAvailable = true;
      rebuildTrayMenu(); // Show "Update available — restart to apply" in tray
    });

    autoUpdater.on('error', (err) => {
      console.error('[Ghost-Drop] updater error:', err.message);
    });
  } catch (e) {
    console.warn('[Ghost-Drop] electron-updater not available:', e.message);
  }
}

let mainWindow    = null;
let tutorialWindow = null;
let tray          = null;

// Single-instance lock — prevent two Ghost-Drop processes competing over the
// same shelf directory and temp session.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function bootstrap() {
  // ── 1. Window first (perceived speed) ────────────────────────────────────
  mainWindow = createOverlayWindow();

  // ── 2. IPC channels (renderer may already be loading) ────────────────────
  wireResizeChannel(ipcMain, mainWindow);
  registerInterceptors(ipcMain, mainWindow);

  // ── 3. Exit hooks (no session dir yet — setSessionDir() fills it in) ─────
  armExitHooks(app);

  // ── 4. Tray ───────────────────────────────────────────────────────────────
  createTray();
  wireTutorialChannels();

  // ── 5. Background I/O — runs after the window is already visible ──────────
  ghostDirectory.purgeOrphans().catch(() => {});
  ghostDirectory.sweepOldShelfFiles().catch(() => {});
  ghostDirectory.initSession().then(dir => {
    setSessionDir(dir); // Executioner now knows what to wipe on exit
  }).catch(err => {
    console.error('[Ghost-Drop] initSession failed:', err.message);
  });

  // ── 6. First-launch tutorial ──────────────────────────────────────────────
  if (!preferences.getPrefs().tutorialSeen) {
    setTimeout(openTutorial, 700);
  }

  // ── 7. Silent update check (packaged builds only) ─────────────────────────
  if (autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 5000); // Wait 5 s after launch so it doesn't slow startup
  }
}

// ── Tutorial ─────────────────────────────────────────────────────────────────

function openTutorial() {
  if (tutorialWindow && !tutorialWindow.isDestroyed()) {
    tutorialWindow.focus();
    return;
  }
  tutorialWindow = createTutorialWindow();
  tutorialWindow.on('closed', () => { tutorialWindow = null; });
}

function wireTutorialChannels() {
  ipcMain.on('ghost-drop:tutorial-seen',  () => preferences.setTutorialSeen());
  ipcMain.on('ghost-drop:tutorial-close', () => {
    if (tutorialWindow && !tutorialWindow.isDestroyed()) tutorialWindow.close();
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function buildTrayMenuTemplate() {
  const template = [
    {
      label: 'Show / hide overlay',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
      },
    },
    {
      label: 'Show tutorial',
      click: openTutorial,
    },
    { type: 'separator' },
    {
      label: 'Support FlushTech',
      click: () => shell.openExternal(SUPPORT_URL),
    },
    { type: 'separator' },
  ];

  if (updateAvailable) {
    template.push({
      label: 'Update available — restart to apply',
      enabled: true,
      click: () => {
        if (autoUpdater) autoUpdater.quitAndInstall(false, true);
      },
    });
    template.push({ type: 'separator' });
  } else if (autoUpdater) {
    template.push({
      label: 'Check for updates',
      click: () => {
        autoUpdater.checkForUpdates().catch(() => {});
      },
    });
    template.push({ type: 'separator' });
  }

  template.push({
    label: 'Quit Ghost-Drop',
    click: () => app.quit(),
  });

  return template;
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()));
}

function createTray() {
  const trayIcon = nativeImage
    .createFromPath(path.join(__dirname, 'assets', 'icon.png'))
    .resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('Ghost-Drop');
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()));
  tray.on('click', () => tray.popUpContextMenu());
}

// The overlay has no close button — stay alive in tray if window is somehow
// closed programmatically. Only the tray "Quit" item should exit the process.
app.on('window-all-closed', () => {});

app.whenReady().then(bootstrap);
