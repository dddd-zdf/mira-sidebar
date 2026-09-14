'use strict';

// The strip is the app's entire IPC surface: one channel of state in, one
// channel of switch requests out.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  find: command => ipcRenderer.send('find:command', command),
  onFind: callback => ipcRenderer.on('find:state', (_event, state) => callback(state)),
  action: (action) => ipcRenderer.send('mira:action', action),
  onState: (callback) => {
    ipcRenderer.on('strip:state', (event, state) => callback(state));
  },
  switchProvider: (id) => {
    ipcRenderer.send('strip:switch-provider', String(id));
  },
});
