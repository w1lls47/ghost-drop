/**
 * THE UI OVERLAY (The Target) — v1.2.0
 * ----------------------------------------
 * ANIMATION APPROACH (why it changed from v1.1):
 * The previous version called setBounds() ~60 times per animation via
 * setInterval. On Windows with a transparent BrowserWindow, the DWM
 * compositor batches those calls and only repaints at its own cadence,
 * so the user sees only the first and last frame — no animation.
 *
 * The fix: the window is ALWAYS the full expanded height, but the file
 * panel is visually hidden via CSS (max-height:0 / opacity:0) when
 * collapsed. The CSS transition runs inside Chromium's own compositor,
 * which renders it perfectly regardless of DWM. The native window only
 * ever gets TWO setBounds calls per expand/collapse cycle:
 *   • expand:       one call, immediately to full height (before CSS starts)
 *   • collapse-done: one call, back to icon size (after CSS finishes)
 * This matches how real Windows overlay tools (ShareX, etc.) handle it.
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');

const ICON_SIZE     = 150;
const EXPANDED_H    = 400;   // icon (150) + gap (8) + panel (242)
const MARGIN        = 24;

let _anchor = null;

function getAnchor() {
  if (_anchor) return _anchor;
  const { workArea } = screen.getPrimaryDisplay();
  _anchor = {
    x: workArea.x + workArea.width - ICON_SIZE - MARGIN,
    y: workArea.y + MARGIN,
  };
  return _anchor;
}

function createOverlayWindow() {
  const { x, y } = getAnchor();

  const win = new BrowserWindow({
    width:  ICON_SIZE,
    height: ICON_SIZE,
    x, y,
    frame:          false,
    transparent:    true,
    backgroundColor:'#00000000',
    alwaysOnTop:    true,
    resizable:      false,
    movable:        false,
    minimizable:    false,
    maximizable:    false,
    fullscreenable: false,
    skipTaskbar:    true,
    hasShadow:      false,
    title:          'Ghost-Drop',
    webPreferences: {
      preload:          path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false, // webUtils.getPathForFile needs this off
    },
  });

  // 'screen-saver' level keeps the overlay above fullscreen apps on Windows
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

/**
 * Wire the two IPC channels the renderer uses to drive window sizing.
 *
 * ghost-drop:expand       → called first; snap window to EXPANDED_H so
 *                           there's room for the CSS animation to run into.
 * ghost-drop:collapse-done → called after the CSS collapse transition ends;
 *                           snap window back to ICON_SIZE.
 */
function wireResizeChannel(ipcMain, win) {
  const { x, y } = getAnchor();

  ipcMain.on('ghost-drop:expand', () => {
    if (!win || win.isDestroyed()) return;
    win.setBounds({ x, y, width: ICON_SIZE, height: EXPANDED_H });
  });

  ipcMain.on('ghost-drop:collapse-done', () => {
    if (!win || win.isDestroyed()) return;
    win.setBounds({ x, y, width: ICON_SIZE, height: ICON_SIZE });
  });
}

function createTutorialWindow() {
  const win = new BrowserWindow({
    width: 460, height: 580,
    frame:          false,
    transparent:    true,
    backgroundColor:'#00000000',
    alwaysOnTop:    true,
    resizable:      false,
    minimizable:    false,
    maximizable:    false,
    fullscreenable: false,
    skipTaskbar:    true,
    hasShadow:      true,
    title:          'Welcome to Ghost-Drop',
    webPreferences: {
      preload:          path.join(__dirname, '..', 'renderer', 'preload-tutorial.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  win.center();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'tutorial.html'));
  return win;
}

module.exports = { createOverlayWindow, createTutorialWindow, wireResizeChannel, ICON_SIZE, EXPANDED_H };
