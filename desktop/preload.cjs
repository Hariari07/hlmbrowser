const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hlm', Object.freeze({
  state: () => ipcRenderer.invoke('state'),
  unlock: password => ipcRenderer.invoke('unlock', password),
  save: (config, password) => ipcRenderer.invoke('save', config, password),
  action: action => ipcRenderer.invoke('action', action),
  onState: fn => ipcRenderer.on('status', (_event, state) => fn(state))
}));
