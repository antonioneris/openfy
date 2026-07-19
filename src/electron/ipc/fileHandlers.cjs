const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { runFfmpeg } = require('../services/ytdlpService.cjs');
const { AUDIO_EXTENSIONS, scanAudioFiles } = require('../services/directoryScanner.cjs');
const state = require('../utils/state.cjs');
const {
  authorizeRoot,
  assertPathAllowed,
  assertTrustedSender,
  requireString
} = require('../utils/ipcSecurity.cjs');

const directoryScans = new Map();

function registerFileHandlers() {
  // 1. Select Folder IPC Handler
  ipcMain.handle('select-folder', async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog(state.mainWindow, {
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return authorizeRoot(result.filePaths[0]).replace(/\\/g, '/');
  });

  // 2. Read Directory IPC Handler
  ipcMain.handle('read-directory', async (event, dirPath, scanId) => {
    assertTrustedSender(event);
    if (scanId !== undefined) requireString(scanId, 'Identificador da varredura', 128);
    const effectiveScanId = scanId || `scan-${Date.now()}`;
    const scan = { cancelled: false };
    directoryScans.set(effectiveScanId, scan);
    try {
      const nativePath = assertPathAllowed(dirPath);
      return await scanAudioFiles(nativePath, {
        isCancelled: () => scan.cancelled,
        onDiscovered: (discovered) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('directory-scan-progress', { scanId: effectiveScanId, discovered });
          }
        }
      });
    } catch (error) {
      if (error && error.code === 'SCAN_CANCELLED') throw error;
      const accessDenied = error && (error.code === 'EACCES' || error.code === 'EPERM');
      if (!accessDenied && !String(error.message).includes('Acesso negado')) throw error;
      throw new Error(`FOLDER_NOT_AUTHORIZED:${path.resolve(path.normalize(dirPath))}`);
    } finally {
      directoryScans.delete(effectiveScanId);
    }
  });

  ipcMain.handle('cancel-directory-scan', async (event, scanId) => {
    assertTrustedSender(event);
    requireString(scanId, 'Identificador da varredura', 128);
    const scan = directoryScans.get(scanId);
    if (!scan) return false;
    scan.cancelled = true;
    return true;
  });

  ipcMain.handle('authorize-folder', async (event, dirPath) => {
    assertTrustedSender(event);
    requireString(dirPath, 'Pasta', 4096);
    const requestedPath = path.resolve(path.normalize(dirPath));
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Reautorizar pasta da biblioteca',
      defaultPath: requestedPath,
      properties: ['openDirectory'],
      message: 'Selecione novamente a mesma pasta para confirmar o acesso.'
    });
    if (result.canceled || result.filePaths.length === 0) return false;
    if (path.resolve(result.filePaths[0]) !== requestedPath) {
      throw new Error('A pasta selecionada não corresponde à pasta que precisa ser reautorizada.');
    }
    authorizeRoot(result.filePaths[0]);
    return true;
  });

  // 3. Read File IPC Handler
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      assertTrustedSender(event);
      const nativePath = assertPathAllowed(filePath, Array.from(AUDIO_EXTENSIONS));
      const buffer = await fs.promises.readFile(nativePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (err) {
      console.error('Failed to read file:', err);
      throw err;
    }
  });

  // 3.5. Read Text File IPC Handler (for LRC files)
  ipcMain.handle('read-text-file', async (event, filePath) => {
    try {
      assertTrustedSender(event);
      const nativePath = assertPathAllowed(filePath, ['.lrc']);
      return await fs.promises.readFile(nativePath, 'utf8');
    } catch (err) {
      console.error('Failed to read text file:', err);
      return null;
    }
  });

  // Select Image File IPC Handler
  ipcMain.handle('select-image-file', async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    try {
      const filePath = result.filePaths[0];
      const buffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
      return { filePath: filePath.replace(/\\/g, '/'), dataUrl };
    } catch (err) {
      console.error('Failed to read selected image:', err);
      return null;
    }
  });

  // Delete File IPC Handler
  ipcMain.handle('delete-file', async (event, filePath) => {
    try {
      assertTrustedSender(event);
      const allowedPath = assertPathAllowed(filePath, [...AUDIO_EXTENSIONS, '.lrc']);
      if (fs.existsSync(allowedPath)) {
        await fs.promises.unlink(allowedPath);
        return { success: true };
      }
      return { success: false, error: 'File does not exist' };
    } catch (err) {
      console.error(`Failed to delete file ${filePath}:`, err);
      return { success: false, error: err.message };
    }
  });

  // Export Playlist IPC Handler
  ipcMain.handle('export-playlist', async (event, { playlistName, tracks }) => {
    assertTrustedSender(event);
    requireString(playlistName, 'Nome da playlist', 255);
    if (!Array.isArray(tracks) || tracks.length > 10000) throw new TypeError('Lista de faixas inválida.');
    // 1. Prompt user to select destination directory
    const result = await dialog.showOpenDialog({
      title: 'Selecione a pasta para exportar a playlist',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Exportação cancelada pelo usuário.' };
    }

    const baseDir = authorizeRoot(result.filePaths[0]);
    const sanitize = (name) => name.replace(/[\\/*?:"<>|]/g, "_");
    const exportFolder = path.join(baseDir, sanitize(playlistName));

    try {
      // 2. Create the target playlist folder
      if (!fs.existsSync(exportFolder)) {
        fs.mkdirSync(exportFolder, { recursive: true });
      }

      let successCount = 0;
      let failCount = 0;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const sourcePath = assertPathAllowed(track.filePath, Array.from(AUDIO_EXTENSIONS));
        
        // Notify renderer process about current progress before processing starts
        event.sender.send('export-playlist-progress', {
          current: i + 1,
          total: tracks.length,
          title: `${track.artist} - ${track.title}`
        });

        if (!fs.existsSync(sourcePath)) {
          failCount++;
          continue;
        }

        const ext = path.extname(sourcePath).toLowerCase();
        const baseName = sanitize(`${track.artist} - ${track.title}`);
        
        // Target paths
        const targetMp3Path = path.join(exportFolder, `${baseName}.mp3`);
        const srcLrcPath = sourcePath.replace(new RegExp(`\\${ext}$`, 'i'), '.lrc');
        const targetLrcPath = path.join(exportFolder, `${baseName}.lrc`);

        try {
          // A. Export audio file (convert to MP3 or copy if already MP3)
          if (ext === '.mp3') {
            fs.copyFileSync(sourcePath, targetMp3Path);
          } else {
            // Convert M4A/other to MP3 using ffmpeg
            // map 0:a and map 0:v? (optional cover art stream)
            await runFfmpeg([
              '-y', '-i', sourcePath, '-map', '0:a', '-map', '0:v?',
              '-c:a', 'libmp3lame', '-q:a', '2', '-c:v', 'copy',
              '-id3v2_version', '3', targetMp3Path
            ]);
          }

          // B. Export LRC file if exists
          if (fs.existsSync(srcLrcPath)) {
            fs.copyFileSync(srcLrcPath, targetLrcPath);
          }

          successCount++;
        } catch (err) {
          console.error(`Falha ao exportar/converter a faixa ${track.title}:`, err);
          failCount++;
        }
      }

      return { success: true, successCount, failCount, path: exportFolder };
    } catch (err) {
      console.error('Erro na exportação da playlist:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = registerFileHandlers;
