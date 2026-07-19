const fs = require('fs');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac']);

function createCancelledError() {
  const error = new Error('SCAN_CANCELLED');
  error.code = 'SCAN_CANCELLED';
  return error;
}

async function scanAudioFiles(rootDir, options = {}) {
  const { isCancelled = () => false, onDiscovered = () => {} } = options;
  const fileList = [];

  async function traverse(dir) {
    if (isCancelled()) throw createCancelledError();
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (isCancelled()) throw createCancelledError();
      const filePath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await traverse(filePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(ext)) continue;

      const stat = await fs.promises.stat(filePath);
      const lrcPath = filePath.substring(0, filePath.length - ext.length) + '.lrc';
      let hasLrc = true;
      try {
        await fs.promises.access(lrcPath, fs.constants.R_OK);
      } catch (_) {
        hasLrc = false;
      }

      fileList.push({
        filePath: filePath.replace(/\\/g, '/'),
        fileName: entry.name,
        lastModified: stat.mtimeMs,
        hasLrc,
      });
      onDiscovered(fileList.length);
    }
  }

  await traverse(rootDir);
  return fileList;
}

module.exports = { AUDIO_EXTENSIONS, scanAudioFiles };
