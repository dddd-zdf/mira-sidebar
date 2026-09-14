'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('miraSettings', {
  read: () => ipcRenderer.invoke('settings:read'),
  save: (settings) => ipcRenderer.invoke('settings:save', settings),
});
