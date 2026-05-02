const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 发送给主进程
  openEntryWindow: () => ipcRenderer.send('OPEN_ENTRY_WINDOW'),
  closeEntryWindow: () => ipcRenderer.send('CLOSE_ENTRY_WINDOW'),
  submitEntryData: (data) => ipcRenderer.send('SUBMIT_ENTRY_DATA', data),
  
  // 接收自主进程
  onEntrySubmitted: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('ENTRY_SUBMITTED_SYNC', subscription);
    return () => ipcRenderer.removeListener('ENTRY_SUBMITTED_SYNC', subscription);
  },
  onWindowModeInit: (callback) => {
    const subscription = (event, mode) => callback(mode);
    ipcRenderer.on('SET_WINDOW_MODE', subscription);
    return () => ipcRenderer.removeListener('SET_WINDOW_MODE', subscription);
  }
});
