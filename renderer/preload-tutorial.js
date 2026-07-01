const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghostDropTutorial', {
  markSeen: () => ipcRenderer.send('ghost-drop:tutorial-seen'),
  close: () => ipcRenderer.send('ghost-drop:tutorial-close'),
});
