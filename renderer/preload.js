const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ghostDrop', {
  // ── Inbound ──────────────────────────────────────────────────────────────
  /** Copy local files (from Explorer / download bar) into the shelf. */
  dropFiles:   (paths)              => ipcRenderer.invoke('ghost-drop:drop-files', paths),
  /** Fetch a remote URL and save it to the shelf (browser image drag). */
  fetchUrl:    (url)                => ipcRenderer.invoke('ghost-drop:fetch-url', url),
  /** Write a raw ArrayBuffer (blob from browser) to the shelf. */
  writeBlob:   (buffer, fileName)   => ipcRenderer.invoke('ghost-drop:write-blob', buffer, fileName),

  // ── Window sizing (animation) ─────────────────────────────────────────────
  /** Expand the native window to its full height — call BEFORE CSS transition. */
  expand:       ()  => ipcRenderer.send('ghost-drop:expand'),
  /** Snap window back to icon size — call AFTER CSS collapse transition ends. */
  collapseDone: ()  => ipcRenderer.send('ghost-drop:collapse-done'),

  // ── Outbound ─────────────────────────────────────────────────────────────
  /** Start an OS-native drag carrying the given shelf file paths. */
  startNativeDrag: (paths) => ipcRenderer.send('ghost-drop:start-native-drag', paths),

  /**
   * Resolve a dropped File object to its real OS path.
   * webUtils.getPathForFile() is the Electron 28+ replacement for the
   * (now removed) File.path property.
   * Returns an empty string for browser-originated blobs (no local path).
   */
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
