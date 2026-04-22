const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  // Load config from local file if exists
  let config = { width: 1425, height: 864 };
  const configPath = path.join(app.getPath('userData'), 'config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.width = savedConfig.width || config.width;
      config.height = savedConfig.height || config.height;
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }

  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    minWidth: 1000,
    minHeight: 750,
    resizable: true,
    title: "财务智能统计软件",
    icon: path.join(__dirname, 'dist/favicon.ico'),
    webPreferences: {
      nodeIntegration: true, // Enabled for direct config file access as requested
      contextIsolation: false,
    },
    autoHideMenuBar: true,
  });

  // 优先加载打包后的文件
  const indexPath = path.join(__dirname, 'dist/index.html');
  win.loadFile(indexPath).catch(() => {
    // 如果还没打包 dist，尝试加载开发服务器（仅供调试）
    win.loadURL('http://localhost:3000');
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
