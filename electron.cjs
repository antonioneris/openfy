const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const state = require('./src/electron/utils/state.cjs');
const ytdlpService = require('./src/electron/services/ytdlpService.cjs');
const { initializePathRegistry } = require('./src/electron/utils/ipcSecurity.cjs');
const castServer = require('./src/electron/services/castServer.cjs');

const registerFileHandlers = require('./src/electron/ipc/fileHandlers.cjs');
const registerDatabaseHandlers = require('./src/electron/ipc/databaseHandlers.cjs');
const registerYoutubeHandlers = require('./src/electron/ipc/youtubeHandlers.cjs');
const registerCastHandlers = require('./src/electron/ipc/castHandlers.cjs');
const registerWindowHandlers = require('./src/electron/ipc/windowHandlers.cjs');

const getIconPath = () => {
  const prodPath = path.join(__dirname, 'dist', 'icon.png');
  const devPath = path.join(__dirname, 'public', 'icon.png');
  return fs.existsSync(prodPath) ? prodPath : devPath;
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'OpenFy',
    icon: getIconPath(),
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#000000',
      symbolColor: '#ffffff',
      height: 32
    } : false,
    trafficLightPosition: { x: 20, y: 12 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  state.mainWindow = win;

  const loadApplication = () => {
    const devServerUrl = process.env.OPENFY_DEV_SERVER_URL;

    if (app.isPackaged) {
      return win.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    if (process.env.OPENFY_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools();
    }

    if (devServerUrl === 'http://127.0.0.1:5173') {
      return win.loadURL(devServerUrl);
    }

    return win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  };

  // Remove menu bar
  win.setMenuBarVisibility(false);

  // Prevent first-start player actions from racing the binary downloads.
  ytdlpService.checkAndPromptDependencies(win)
    .catch(err => console.error('Deps check failed:', err))
    .finally(loadApplication);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[App] Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const myWindow = windows[0];
      if (myWindow.isMinimized()) myWindow.restore();
      myWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Initialize local binary paths
    ytdlpService.initPaths(app.getPath('userData'));
    initializePathRegistry(app.getPath('userData'), app.getPath('temp'));

    // Register IPC handlers
    registerFileHandlers();
    registerDatabaseHandlers();
    registerYoutubeHandlers();
    registerCastHandlers();
    registerWindowHandlers();

    // Start discovery delay to let network settle
    setTimeout(() => {
      castServer.startCastDiscovery();
    }, 3000);

    if (process.platform === 'darwin') {
      try {
        const iconPath = getIconPath();
        if (fs.existsSync(iconPath)) {
          app.dock.setIcon(iconPath);
        }
      } catch (err) {
        console.error('Failed to set dock icon:', err);
      }
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    console.log('[App] Quitting OpenFy... Cleaning up resources.');
    castServer.cleanup();
  });
}
