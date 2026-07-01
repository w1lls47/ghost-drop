const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ghostDrop', {
  /** Send the resolved OS paths of dropped files to the main process for caching. */
  dropFiles: (paths) => ipcRenderer.invoke('ghost-drop:drop-files', paths),

  /** Fire-and-forget: must be called synchronously from a `dragstart` handler. */
  startNativeDrag: (paths) => ipcRenderer.send('ghost-drop:start-native-drag', paths),

  /** Grow/shrink the overlay window — main process owns the animation itself. */
  setExpanded: (expand) => ipcRenderer.send('ghost-drop:set-expanded', expand),

  /**
   * Electron 28+ removed the (insecure) File.path property; webUtils is the
   * sanctioned replacement for resolving a real OS path from a dropped File.
   */
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
