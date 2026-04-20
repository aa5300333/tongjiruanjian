const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "六合彩财务智能统计软件",
    icon: path.join(__dirname, 'dist/favicon.ico'), // 如果有图标的话
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true, // 隐藏上方菜单栏
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
