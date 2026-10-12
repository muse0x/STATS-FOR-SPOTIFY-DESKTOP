const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openBrowserAuth: (payload) => ipcRenderer.invoke('open-browser-auth', payload),
  openPopupAuth: (payload) => ipcRenderer.invoke('open-popup-auth', payload),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  scanDownloadsHistory: () => ipcRenderer.invoke('scan-downloads-history'),
  selectHistoryFiles: () => ipcRenderer.invoke('select-history-files'),
});
