const { app, BrowserWindow, ipcMain, Menu, clipboard } = require('electron');
const path = require('path');

let mainWindow;
let entryWindow;
let settingsWindow;
let clipboardTimer = null;
let lastClipboardText = '';

function startClipboardMonitor() {
  if (clipboardTimer) return;
  lastClipboardText = clipboard.readText();
  clipboardTimer = setInterval(() => {
    if (!entryWindow || entryWindow.isDestroyed() || !entryWindow.isVisible()) return;
    
    const currentText = clipboard.readText();
    if (currentText && currentText !== lastClipboardText) {
      lastClipboardText = currentText;
      console.log('检测到剪贴板更新，自动同步到录入窗口');
      entryWindow.webContents.send('clipboard-data', currentText);
    }
  }, 500);
}

function stopClipboardMonitor() {
  if (clipboardTimer) {
    clearInterval(clipboardTimer);
    clipboardTimer = null;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 956,
    resizable: true,
    title: "财务智能统计软件",
    icon: path.join(__dirname, 'dist/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // 禁用沙盒以允许 preload 使用 require
      preload: path.resolve(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
    show: false, // 初始隐藏
    backgroundColor: '#ffffff', // 设置背景色，减少白屏感
  });

  // 当页面准备好显示时才打开窗口，防止白屏
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 彻底移除菜单栏
  mainWindow.setMenu(null);
  if (mainWindow.removeMenu) mainWindow.removeMenu();

  const indexPath = path.join(__dirname, 'dist/index.html');
  mainWindow.loadFile(indexPath).catch(() => {
    mainWindow.loadURL('http://localhost:3000');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.isQuitting = true; // 标记正在退出
    if (entryWindow) {
      entryWindow.destroy(); // 强制销毁录入窗口，不触发 close 事件中的 preventDefault
    }
    if (settingsWindow) {
      settingsWindow.destroy();
    }
    app.quit(); // 明确退出
  });
}

function createEntryWindow() {
  console.log('执行 createEntryWindow...');
  entryWindow = new BrowserWindow({
    width: 650,
    height: 826,
    show: false,
    frame: true, // 恢复系统边框
    transparent: false, // 恢复非透明背景
    hasShadow: true,
    resizable: true,
    thickFrame: true,
    alwaysOnTop: false,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      sandbox: false, // 禁用沙盒以允许 preload 使用 require
      preload: path.resolve(__dirname, 'preload.cjs'),
    },
  });

  // 彻底移除菜单栏
  entryWindow.setMenu(null);
  if (entryWindow.removeMenu) entryWindow.removeMenu();

  // 启动剪贴板监控
  startClipboardMonitor();

  const indexPath = path.join(__dirname, 'dist/index.html');
  const url = app.isPackaged 
    ? `file://${indexPath}?mode=entry` 
    : 'http://localhost:3000?mode=entry';
  
  entryWindow.loadURL(url);

  // 1. 生命周期维护：确保销毁后变量归零
  entryWindow.on('closed', () => {
    console.log('Main: entryWindow 已彻底关闭并归零');
    entryWindow = null;
    stopClipboardMonitor();
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 450,
    height: 700,
    show: false,
    frame: true,
    resizable: false,
    title: "系统设置",
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.resolve(__dirname, 'preload.cjs'),
    },
  });

  settingsWindow.setMenu(null);

  const indexPath = path.join(__dirname, 'dist/index.html');
  const url = app.isPackaged 
    ? `file://${indexPath}?mode=settings` 
    : 'http://localhost:3000?mode=settings';
  
  settingsWindow.loadURL(url);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });
}

app.whenReady().then(() => {
  // 全局停用菜单，这是最彻底的方法
  Menu.setApplicationMenu(null);
  createMainWindow();
  createEntryWindow();
});

// 监听所有新窗口创建，确保没有菜单
app.on('browser-window-created', (e, window) => {
  window.setMenu(null);
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  // 无论是在什么平台，只要窗口全关了就彻底退出，防止占用文件夹
  app.quit();
});

// 在退出前确保所有资源被释放
app.on('will-quit', () => {
  process.exit(0);
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

// IPC 高速通信
ipcMain.on('show-entry-window', (event, arg) => {
  console.log('收到 show-entry-window 指令，参数：', JSON.stringify(arg));
  
  // 核心原则：单例模式检查
  if (entryWindow && !entryWindow.isDestroyed()) {
    console.log('录入窗口已存在，执行强制显示调度方案');
    
    // 【原生窗口强制调度】终极加固方案：
    
    // 1. 如果窗口被最小化，立即恢复并显示
    if (entryWindow.isMinimized()) entryWindow.restore();
    
    entryWindow.show();
    startClipboardMonitor();
    
    // 3. 强行夺取系统焦点
    entryWindow.focus();
    
    // 5. 透传参数而不刷新页面
    if (arg && arg.type) {
      entryWindow.webContents.send('set-entry-mode', arg.type);
    }
  } else {
    console.log('录入窗口不存在或已销毁，执行重新创建逻辑');
    createEntryWindow();
    entryWindow.once('ready-to-show', () => {
      entryWindow.show();
      if (arg && arg.type) {
        entryWindow.webContents.send('set-entry-mode', arg.type);
      }
    });
  }
});

ipcMain.on('hide-entry-window', () => {
  if (entryWindow) {
    entryWindow.hide();
    stopClipboardMonitor();
  }
});

ipcMain.on('show-settings-window', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
  } else {
    createSettingsWindow();
  }
});

ipcMain.on('hide-settings-window', () => {
  if (settingsWindow) {
    settingsWindow.hide();
  }
});

ipcMain.on('settings-updated', () => {
  if (mainWindow) {
    mainWindow.webContents.send('settings-updated-trigger');
  }
});

ipcMain.on('undo-entry', (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send('undo-entry-trigger', data);
  }
});

ipcMain.on('submit-entry', (event, data) => {
  // 立即将数据转发给主窗口
  if (mainWindow) {
    // 确保直接使用发送过来的 ID，不再重新生成
    mainWindow.webContents.send('entry-data-submitted', data);
  }
});

// Window Resizing for Compact Mode
ipcMain.on('resize-main-window', (event, { width, height }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSize(width, height);
    mainWindow.center();
  }
});
