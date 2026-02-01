const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dwcAPI', {
  loadData: () => ipcRenderer.invoke('dwc:load'),
  saveData: (payload) => ipcRenderer.invoke('dwc:save', payload)
});
