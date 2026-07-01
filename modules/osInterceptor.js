/**
 * THE OS INTERCEPTOR (The Bridge)
 * ---------------------------------
 * Hooks the IPC layer that bridges renderer-side HTML5 drag events to the
 * real operating system.
 *
 * INBOUND: the renderer already received the OS-native drop (Chromium
 * surfaces that as a normal `drop` event); this module's job is just to
 * take the resolved source paths and hand them to the Ghost Directory.
 *
 * OUTBOUND: this is the actual "trick". When the user drags a populated
 * icon out of the overlay, we intercept the renderer's `dragstart`,
 * suppress Chromium's default (web-only) drag, and call
 * webContents.startDrag() instead — which asks the OS to begin a native
 * drag session carrying a real file path. To the target app (Premiere,
 * Photoshop, Explorer, Finder) this is indistinguishable from a drag
 * that started in their own native file browser.
 */

const path = require('path');
const { nativeImage } = require('electron');
const ghostDirectory = require('./ghostDirectory');

function registerInterceptors(ipcMain, win) {
  // INBOUND
  ipcMain.handle('ghost-drop:drop-files', async (_event, sourcePaths) => {
    const cached = [];
    for (const src of sourcePaths) {
      try {
        const destPath = await ghostDirectory.copyFileIn(src);
        cached.push({ name: path.basename(destPath), path: destPath });
      } catch (err) {
        console.error('[Ghost-Drop] copy failed for', src, err);
      }
    }
    return cached;
  });

  // OUTBOUND — must be synchronous w.r.t. the native mouse-down/drag gesture,
  // so this is `ipcMain.on` (fire-and-forget), never `invoke`.
  ipcMain.on('ghost-drop:start-native-drag', (event, filePaths) => {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return;

    const icon = nativeImage
      .createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'))
      .resize({ width: 48, height: 48 });

    // `file` (singular) is the officially documented, cross-platform-reliable
    // path. `files` (plural) works on macOS but is flaky/undocumented on
    // Windows, so we pass both: apps that understand `files` get the full
    // batch, everything else falls back to the first file.
    event.sender.startDrag({
      file: filePaths[0],
      files: filePaths,
      icon,
    });
  });
}

module.exports = { registerInterceptors };
