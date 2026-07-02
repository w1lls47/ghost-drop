/**
 * THE OS INTERCEPTOR (The Bridge) — v1.2.0
 * ------------------------------------------
 * Handles all IPC between the renderer and the OS / file system.
 *
 * INBOUND (files arriving into Ghost-Drop):
 *   ghost-drop:drop-files  — local file paths from Explorer / download bar
 *   ghost-drop:fetch-url   — URL from browser image drag (no local path exists)
 *   ghost-drop:write-blob  — raw ArrayBuffer from browser blob drag
 *
 * OUTBOUND (files leaving Ghost-Drop to an external app):
 *   ghost-drop:start-native-drag — starts an OS-native drag session carrying
 *     the permanent shelf paths, so Premiere/Photoshop see them exactly as
 *     if the drag originated in a native file browser.
 */

const path = require('path');
const { nativeImage } = require('electron');
const ghostDirectory = require('./ghostDirectory');

function registerInterceptors(ipcMain, win) {

  // ── INBOUND: local files ─────────────────────────────────────────────────
  ipcMain.handle('ghost-drop:drop-files', async (_e, sourcePaths) => {
    const out = [];
    for (const src of sourcePaths) {
      try {
        const dest = await ghostDirectory.copyFileIn(src);
        out.push({ name: path.basename(dest), path: dest });
      } catch (err) {
        console.error('[Ghost-Drop] copy failed:', src, err.message);
      }
    }
    return out;
  });

  // ── INBOUND: URL (browser image drag where no local path is available) ───
  ipcMain.handle('ghost-drop:fetch-url', async (_e, url) => {
    try {
      const dest = await ghostDirectory.fetchUrlToShelf(url);
      return { name: path.basename(dest), path: dest };
    } catch (err) {
      console.error('[Ghost-Drop] fetch failed:', url, err.message);
      return null;
    }
  });

  // ── INBOUND: raw blob (browser canvas / data-URI drag) ───────────────────
  ipcMain.handle('ghost-drop:write-blob', async (_e, buffer, fileName) => {
    try {
      const dest = await ghostDirectory.writeBufferToShelf(buffer, fileName);
      return { name: path.basename(dest), path: dest };
    } catch (err) {
      console.error('[Ghost-Drop] blob write failed:', err.message);
      return null;
    }
  });

  // ── OUTBOUND: native OS drag ──────────────────────────────────────────────
  // Must be fire-and-forget (ipcMain.on, not handle) — startDrag() must be
  // called synchronously with respect to the user's mouse-down gesture.
  ipcMain.on('ghost-drop:start-native-drag', (event, filePaths) => {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return;

    const icon = nativeImage
      .createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'))
      .resize({ width: 48, height: 48 });

    event.sender.startDrag({
      file:  filePaths[0],   // always present — universal fallback
      files: filePaths,      // full batch (reliable on macOS, best-effort on Windows)
      icon,
    });
  });
}

module.exports = { registerInterceptors };
