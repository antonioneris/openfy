const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { assertTrustedSender } = require('../utils/ipcSecurity.cjs');

const MAX_DATABASE_BYTES = 256 * 1024 * 1024;

function registerDatabaseHandlers() {
  // IPC handlers for saving/loading SQLite database directly to/from disk
  ipcMain.handle('save-database', async (event, arrayBuffer) => {
    try {
      assertTrustedSender(event);
      const dbPath = path.join(app.getPath('userData'), 'library.db');
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0 || buffer.length > MAX_DATABASE_BYTES) throw new Error('Tamanho do banco de dados inválido.');
      const temporaryPath = `${dbPath}.tmp`;
      await fs.promises.writeFile(temporaryPath, buffer, { mode: 0o600 });
      await fs.promises.rename(temporaryPath, dbPath);
      return true;
    } catch (err) {
      console.error('Failed to save SQLite database:', err);
      return false;
    }
  });

  ipcMain.on('get-wasm-binary-sync', (event) => {
    try {
      assertTrustedSender(event);
      const baseDir = app.getAppPath();
      const candidates = [
        path.join(baseDir, 'dist', 'sql-wasm.wasm'),
        path.join(baseDir, 'dist', 'sql-wasm-browser.wasm')
      ];
      let wasmPath = null;
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          wasmPath = p;
          break;
        }
      }
      if (!wasmPath) {
        event.returnValue = null;
        return;
      }
      const buffer = fs.readFileSync(wasmPath);
      event.returnValue = buffer;
    } catch (err) {
      console.error('[WASM IPC] Failed to read WASM binary:', err);
      event.returnValue = null;
    }
  });

  ipcMain.handle('load-database', async (event) => {
    try {
      assertTrustedSender(event);
      const dbPath = path.join(app.getPath('userData'), 'library.db');
      if (fs.existsSync(dbPath)) {
        const buffer = await fs.promises.readFile(dbPath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      }
    } catch (err) {
      console.error('Failed to load SQLite database:', err);
    }
    return null;
  });
}

module.exports = registerDatabaseHandlers;
