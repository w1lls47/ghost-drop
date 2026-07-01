/**
 * GHOST-DROP — main process
 * ---------------------------
 * Boot order:
 *   1. Purge any orphaned sessions from a previous crash (Executioner failsafe)
 *   2. Open a fresh Ghost Directory session for THIS run
 *   3. Raise the UI Overlay, wire its resize-animation channel
 *   4. Wire the OS Interceptor (inbound drop / outbound native drag)
 *   5. Arm the exit hooks so this session is guaranteed to be wiped too
 *   6. Stand up the tray — the only sanctioned way to quit, re-open the
 *      tutorial, or find the support link
 *   7. If this is a first launch, show the tutorial once, automatically
 */

const { app, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');

const ghostDirectory = require('./modules/ghostDirectory');
const preferences = require('./modules/preferences');
const { armExitHooks } = require('./modules/executioner');
const {
  createOverlayWindow,
  createTutorialWindow,
  wireResizeChannel,
} = require('./modules/uiOverlay');
const { registerInterceptors } = require('./modules/osInterceptor');

// Lemon Squeezy "Support FlushTech" tip jar — pay-what-you-want, no pressure.
const SUPPORT_URL = 'https://flushtechshop.lemonsqueezy.com/checkout/buy/7ee734e4-2fe7-403e-bf67-162c00549ae6';

let mainWindow = null;
let tutorialWindow = null;
let tray = null;

async function bootstrap() {
  await ghostDirectory.purgeOrphans();
  const sessionDir = await ghostDirectory.initSession();

  mainWindow = createOverlayWindow();
  wireResizeChannel(ipcMain, mainWindow);
  registerInterceptors(ipcMain, mainWindow);
  armExitHooks(app, sessionDir);

  createTray();
  wireTutorialChannels();

  if (!preferences.getPrefs().tutorialSeen) {
    setTimeout(openTutorial, 600); // small delay so it doesn't appear mid-launch flicker
  }
}

function openTutorial() {
  if (tutorialWindow && !tutorialWindow.isDestroyed()) {
    tutorialWindow.focus();
    return;
  }
  tutorialWindow = createTutorialWindow();
  tutorialWindow.on('closed', () => {
    tutorialWindow = null;
  });
}

function wireTutorialChannels() {
  ipcMain.on('ghost-drop:tutorial-seen', () => preferences.setTutorialSeen());
  ipcMain.on('ghost-drop:tutorial-close', () => {
    if (tutorialWindow && !tutorialWindow.isDestroyed()) tutorialWindow.close();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('Ghost-Drop — running');

  const menu = Menu.buildFromTemplate([
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
    {
      label: 'Quit Ghost-Drop',
      click: () => app.quit(), // triggers before-quit / will-quit -> the purge
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => tray.popUpContextMenu());
}

app.whenReady().then(bootstrap);

// The overlay window has no close button by design. Stay alive on the tray
// rather than quitting — quitting only ever happens via the tray's "Quit".
app.on('window-all-closed', () => {});

// Single instance: a second launch should just focus the existing overlay,
// not spin up a second Ghost Directory session.
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
