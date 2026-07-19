const { ipcMain, shell } = require('electron');
const state = require('../utils/state.cjs');
const { updateCastPlayback } = require('../services/castServer.cjs');
const { assertTrustedSender, requireHttpUrl } = require('../utils/ipcSecurity.cjs');

let normalBounds = null;

function registerWindowHandlers() {
  // IPC: Enter/Exit Mini Player Mode
  ipcMain.handle('enter-mini-player', (event) => {
    assertTrustedSender(event);
    if (!state.mainWindow) return;
    normalBounds = state.mainWindow.getBounds();
    
    state.mainWindow.setAlwaysOnTop(true, 'screen-saver');
    
    if (process.platform === 'darwin') {
      state.mainWindow.setWindowButtonVisibility(false);
    }
    
    state.mainWindow.setMinimumSize(320, 110);
    
    state.mainWindow.setBounds({
      width: 340,
      height: 120,
      x: normalBounds.x + normalBounds.width - 340,
      y: normalBounds.y + normalBounds.height - 120
    }, true);
    
    state.mainWindow.webContents.send('mini-player-changed', true);
  });

  ipcMain.handle('exit-mini-player', (event) => {
    assertTrustedSender(event);
    if (!state.mainWindow) return;
    
    state.mainWindow.setAlwaysOnTop(false);
    
    if (process.platform === 'darwin') {
      state.mainWindow.setWindowButtonVisibility(true);
    }
    
    state.mainWindow.setMinimumSize(900, 600);
    
    if (normalBounds) {
      state.mainWindow.setBounds(normalBounds, true);
    } else {
      state.mainWindow.setSize(1280, 800, true);
    }
    
    state.mainWindow.webContents.send('mini-player-changed', false);
  });

  // Open External URL in Default Browser IPC Handler
  ipcMain.handle('open-external', async (event, url) => {
    try {
      assertTrustedSender(event);
      await shell.openExternal(requireHttpUrl(url));
      return true;
    } catch (err) {
      console.error('Failed to open external URL:', err);
      return false;
    }
  });

  // Update Playback State IPC Handler
  ipcMain.handle('update-playback-state', async (event, playbackState) => {
    assertTrustedSender(event);
    if (!playbackState || typeof playbackState !== 'object' || Array.isArray(playbackState)) {
      throw new TypeError('Estado de reprodução inválido.');
    }
    const prevFilePath = state.currentPlaybackState.filePath;

    // Update state in memory
    state.currentPlaybackState = {
      title: playbackState.title || '',
      artist: playbackState.artist || '',
      album: playbackState.album || '',
      duration: playbackState.duration || 0,
      currentTime: playbackState.currentTime || 0,
      isPlaying: playbackState.isPlaying || false,
      lyrics: playbackState.lyrics || [],
      coverArt: playbackState.coverArt || '',
      filePath: playbackState.filePath || '',
      hasPrev: playbackState.hasPrev || false,
      hasNext: playbackState.hasNext || false,
      prevTrack: playbackState.prevTrack || null,
      nextTrack: playbackState.nextTrack || null
    };

    updateCastPlayback(playbackState, prevFilePath);
    return true;
  });
}

module.exports = registerWindowHandlers;
