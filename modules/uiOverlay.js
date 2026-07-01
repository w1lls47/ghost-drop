/**
 * THE UI OVERLAY (The Target)
 * ----------------------------
 * Pure presentation shell. No title bar, no menu, no close button on the
 * main ghost overlay — it exists to accept drops and nothing else.
 *
 * Two windows live in this module:
 *   - the main overlay (unchanged in spirit from v1: 150x150, anchored
 *     top-right, idle/hover/populated) — now with one addition: it can
 *     smoothly grow downward to reveal the file list on hover, then
 *     shrink back. That growth is real native window resizing, animated
 *     by hand (Windows doesn't animate setBounds() on its own), not a
 *     CSS trick — so the window is genuinely tiny and out of the way
 *     whenever the list isn't open.
 *   - the tutorial window — a separate, normal-sized modal shown on first
 *     launch (and on demand from the tray), unrelated to the overlay's
 *     "no chrome" rule.
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');

const ICON_SIZE = 150;
const EXPANDED_HEIGHT = 370;
const MARGIN = 24;

let cachedAnchor = null; // {x, y} top-right anchor, computed once

function getAnchor() {
  if (cachedAnchor) return cachedAnchor;
  const { workArea } = screen.getPrimaryDisplay();
  cachedAnchor = {
    x: workArea.x + workArea.width - ICON_SIZE - MARGIN,
    y: workArea.y + MARGIN,
  };
  return cachedAnchor;
}

function createOverlayWindow() {
  const { x, y } = getAnchor();

  const win = new BrowserWindow({
    width: ICON_SIZE,
    height: ICON_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    title: 'Ghost-Drop',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // webUtils.getPathForFile needs this off in the preload context
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver'); // stays above fullscreen apps on Windows
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  return win;
}

/**
 * Hand-rolled resize animation. setBounds() on Windows is instant — there's
 * no built-in "animate" support like macOS has — so smoothness here comes
 * from calling setBounds() ~60 times over the duration with an eased value,
 * same trick a lot of native Windows overlay apps use. Each call is a cheap
 * SetWindowPos under the hood.
 *
 * Expanding gets a slight spring overshoot (the "liquid" bounce); collapsing
 * settles calmly with no overshoot, so it never wobbles back through the
 * tiny 150px size right when it's trying to land there.
 */
let activeAnimation = null;

function easeOutBack(t) {
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animateOverlayHeight(win, expand) {
  if (!win || win.isDestroyed()) return;
  if (activeAnimation) clearInterval(activeAnimation);

  const { x, y } = getAnchor();
  const current = win.getBounds();
  const from = current.height;
  const to = expand ? EXPANDED_HEIGHT : ICON_SIZE;
  const duration = expand ? 320 : 220;
  const easing = expand ? easeOutBack : easeOutCubic;
  const start = Date.now();

  activeAnimation = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(activeAnimation);
      return;
    }
    const elapsed = Date.now() - start;
    const t = Math.min(1, elapsed / duration);
    const eased = easing(t);
    const height = Math.round(from + (to - from) * eased);
    win.setBounds({ x, y, width: ICON_SIZE, height: Math.max(height, ICON_SIZE) });

    if (t >= 1) {
      clearInterval(activeAnimation);
      activeAnimation = null;
      win.setBounds({ x, y, width: ICON_SIZE, height: to }); // land exactly on target
    }
  }, 16); // ~60fps
}

function wireResizeChannel(ipcMain, win) {
  ipcMain.on('ghost-drop:set-expanded', (_event, expand) => {
    animateOverlayHeight(win, expand);
  });
}

function createTutorialWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 580,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    title: 'Welcome to Ghost-Drop',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload-tutorial.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.center();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'tutorial.html'));
  return win;
}

module.exports = {
  createOverlayWindow,
  createTutorialWindow,
  wireResizeChannel,
  ICON_SIZE,
  EXPANDED_HEIGHT,
};
