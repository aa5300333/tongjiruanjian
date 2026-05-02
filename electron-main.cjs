const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let entryWindow;

function createWindows() {
  // 1. 创建主窗口
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 930,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    title: "财务智能统计软件",
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  // 2. 预创建录入助手窗口 (原生池化，启动后即处于“热”状态)
  entryWindow = new BrowserWindow({
    width: 600,
    height: 800,
    show: false, // 预创建但隐藏
    frame: false, // 无原生边框，使用 React 自定义
    transparent: true, // 透明以支持 React 渲染的阴影
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  const url = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, 'dist/index.html')}`;

  mainWindow.loadURL(url);
  entryWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.removeMenu();
  entryWindow.removeMenu();
}

// --- IPC 高速原生总线 ---
ipcMain.on('OPEN_ENTRY_WINDOW', () => {
  if (entryWindow) {
    // 立即显示，无感加载
    entryWindow.webContents.send('SET_WINDOW_MODE', 'entry');
    entryWindow.show();
    entryWindow.focus();
  }
});

ipcMain.on('CLOSE_ENTRY_WINDOW', () => {
  if (entryWindow) entryWindow.hide();
});

ipcMain.on('SUBMIT_ENTRY_DATA', (event, data) => {
  // 接收录入窗数据并回传主窗口执行逻辑
  if (mainWindow) {
    mainWindow.webContents.send('ENTRY_SUBMITTED_SYNC', data);
  }
});

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
