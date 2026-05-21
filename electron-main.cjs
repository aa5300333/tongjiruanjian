const { app, BrowserWindow, ipcMain, Menu, clipboard } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let entryWindow;
let settingsWindow;
let clipboardTimer = null;
let lastClipboardText = '';

// PaddleOCR-json 进程管理与支持
let ocrProcess = null;

function initPaddleOCR() {
  console.log('正在检测并运行 PaddleOCR-json 离线引擎...');
  
  // 1. 获取软件实际运行所在的物理目录（双击的 exe 同级目录）
  // process.execPath 指向当前运行的 exe (在便携版中，指向临时目录的 exe 或真实的外部 exe)
  // 我们穿透找它的物理同级目录
  const currentExeDir = path.dirname(process.execPath);
  // app.getAppPath() 指向当前程序的应用目录
  const appPath = app.getAppPath();
  const projectRootDir = path.join(appPath, '..', '..'); // 穿透 app.asar 的外部物理根目录

  const possiblePaths = [
    // 优先：双击运行的 .exe 同级目录下的 big/ 或 bin/ 目录 (最适合便携版，用户把 big 文件夹放在软件外面同级)
    path.join(currentExeDir, 'big', 'PaddleOCR-json.exe'),
    path.join(currentExeDir, 'bin', 'PaddleOCR-json.exe'),
    path.join(currentExeDir, 'PaddleOCR-json.exe'),

    // 其次：开发环境或传统 unpacked 打包时，项目根目录或 resources 下的目录
    path.join(__dirname, 'big', 'PaddleOCR-json.exe'),
    path.join(__dirname, 'bin', 'PaddleOCR-json.exe'),
    path.join(process.resourcesPath, 'big', 'PaddleOCR-json.exe'),
    path.join(process.resourcesPath, 'bin', 'PaddleOCR-json.exe'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'big', 'PaddleOCR-json.exe'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'PaddleOCR-json.exe'),
    path.join(projectRootDir, 'big', 'PaddleOCR-json.exe'),
    path.join(projectRootDir, 'bin', 'PaddleOCR-json.exe'),
  ];

  let exePath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      exePath = p;
      break;
    }
  }

  if (!exePath) {
    console.warn('⚠️ 未在任何可能路径下找到 PaddleOCR-json.exe，离线图片识别功能将不可用。');
    return;
  }

  try {
    // 开启后台 PaddleOCR 进程 (以管道 JSON 交互模式运行，不打开外部 CMD)
    ocrProcess = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true
    });

    ocrProcess.stdout.on('data', (data) => {
      console.log('PaddleOCR-json 响应数据:', data.toString('utf8'));
    });

    console.log('✅ PaddleOCR-json 后端进程挂载完成：', exePath);
  } catch (err) {
    console.error('❌ 拉起 PaddleOCR-json 进程失败:', err);
  }
}

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
  initPaddleOCR();
  createMainWindow();
  createEntryWindow();
});

// 监听所有新窗口创建，确保没有菜单
app.on('browser-window-created', (e, window) => {
  window.setMenu(null);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (ocrProcess) {
    ocrProcess.kill();
    ocrProcess = null;
  }
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

// Broadcast lottery reset signal to all windows
ipcMain.on('reset-entry', (event, data) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (win.id !== event.sender.id) {
      win.webContents.send('reset-entry-trigger', data);
    }
  });
});

// Broadcast customer state sync signal to all windows
ipcMain.on('sync-customer-state', (event, data) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (win.id !== event.sender.id) {
      win.webContents.send('sync-customer-state', data);
    }
  });
});

// 新增：高精准度离线 PaddleOCR-json 进程调用逻辑
ipcMain.handle('perform-offline-ocr', async (event, base64Data) => {
  return new Promise((resolve) => {
    if (!ocrProcess) {
      resolve({ success: false, error: '后台 PaddleOCR 离线引擎尚未初始化，请确保已将压缩包文件正确解压至项目的 bin/ 文件夹下。' });
      return;
    }

    try {
      // 1. 将 Base64 格式的图片数据快速写出为本地系统的临时图片文件
      const tempImgPath = path.join(os.tmpdir(), `ocr_temp_${Date.now()}.png`);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(tempImgPath, buffer);

      // 2. 拼接成 PaddleOCR-json 可识别的单行格式命令，注入到后台执行管道，要求获取纯文本
      const command = JSON.stringify({ image_path: tempImgPath }) + '\n';
      
      // 创建一次性监听，接收本次对应的识别流响应
      const onData = (data) => {
        try {
          const resStr = data.toString('utf8');
          // PaddleOCR-json 解析成功，返回的 JSON 通常带有 code: 100 和 data
          const parsed = JSON.parse(resStr);
          
          // 安全清除临时图片文件
          try { fs.unlinkSync(tempImgPath); } catch {}
          ocrProcess.stdout.removeListener('data', onData);

          if (parsed && parsed.code === 100 && Array.isArray(parsed.data)) {
            // 将每一行解析出的汉字和号码结合换行拼装
            const resultLines = parsed.data.map(item => item.text);
            resolve({ success: true, text: resultLines.join('\n') });
          } else if (parsed && parsed.code === 101) {
            resolve({ success: true, text: '' }); // 空白图片或无字
          } else {
            resolve({ success: false, error: parsed.data || '引擎返回异常状态' });
          }
        } catch (e) {
          // JSON 截断或未拼接完整，继续等待，直到解析出完整数据
        }
      };

      ocrProcess.stdout.on('data', onData);
      ocrProcess.stdin.write(command);

      // 设置安全超时断开机制：防止空转，3秒无阻断防护
      setTimeout(() => {
        ocrProcess.stdout.removeListener('data', onData);
        try { fs.unlinkSync(tempImgPath); } catch {}
        resolve({ success: false, error: 'OCR 识别服务超时，请确认图片大小或重试。' });
      }, 3500);

    } catch (err) {
      console.error(err);
      resolve({ success: false, error: err.message });
    }
  });
});
