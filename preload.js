const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dwcAPI', {
  loadData: () => ipcRenderer.invoke('dwc:load'),
  saveData: (payload) => ipcRenderer.invoke('dwc:save', payload),
  importPhotos: (logId, files) => ipcRenderer.invoke('dwc:importPhotos', logId, files),
  exportData: (payload, type) => ipcRenderer.invoke('dwc:export', payload, type),
  loadNutrients: () => ipcRenderer.invoke('dwc:nutrients')
});
