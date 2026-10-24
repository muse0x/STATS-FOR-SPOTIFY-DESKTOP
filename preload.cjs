const { contextBridge: ContextBridge, ipcRenderer: IpcRenderer } = require('electron');

ContextBridge.exposeInMainWorld('electronAPI', {
  openPopupAuth: (Payload) => IpcRenderer.invoke('open-popup-auth', Payload),
  openExternalUrl: (Url) => IpcRenderer.invoke('open-external-url', Url),
  scanDownloadsHistory: () => IpcRenderer.invoke('scan-downloads-history'),
  selectHistoryFiles: () => IpcRenderer.invoke('select-history-files'),
});
