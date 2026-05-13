const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel, func) => {
    const subscription = (event, ...args) => func(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  showEntryWindow: (type = 'save') => {
    ipcRenderer.send('show-entry-window', { type });
  },
  hideEntryWindow: () => {
    ipcRenderer.send('hide-entry-window');
  },
  submitEntry: (data) => {
    ipcRenderer.send('submit-entry', data);
  },
  showSettingsWindow: () => {
    ipcRenderer.send('show-settings-window');
  },
  hideSettingsWindow: () => {
    ipcRenderer.send('hide-settings-window');
  },
  notifySettingsUpdated: () => {
    ipcRenderer.send('settings-updated');
  }
});
