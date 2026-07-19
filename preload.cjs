// Preload script for Electron
// Provides a secure bridge between renderer and main processes
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  saveDatabase: (arrayBuffer) => ipcRenderer.invoke('save-database', arrayBuffer),
  loadDatabase: () => ipcRenderer.invoke('load-database'),
  getWasmBinary: () => {
    try {
      const data = ipcRenderer.sendSync('get-wasm-binary-sync');
      if (data instanceof Uint8Array) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }
      return data;
    } catch (err) {
      console.error('Failed to retrieve preloaded WASM binary:', err);
      return null;
    }
  },
  searchYouTubeMusic: (query) => ipcRenderer.invoke('yt-search', query),
  downloadSong: (options) => ipcRenderer.invoke('yt-download', options),
  getAlbumTracks: (albumId) => ipcRenderer.invoke('yt-get-album-tracks', albumId),
  getYtArtistDetails: (artistId) => ipcRenderer.invoke('yt-get-artist-details', artistId),
  getPlaylistTracks: (playlistId) => ipcRenderer.invoke('yt-get-playlist-tracks', playlistId),
  getPlaylistDetails: (playlistId) => ipcRenderer.invoke('yt-get-playlist-details', playlistId),
  getSearchAutocomplete: (query) => ipcRenderer.invoke('yt-search-autocomplete', query),
  resolveSpotifyUrl: (url, credentials) => ipcRenderer.invoke('resolve-spotify-url', url, credentials),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  authorizeFolder: (dirPath) => ipcRenderer.invoke('authorize-folder', dirPath),
  readDirectory: (dirPath, scanId) => ipcRenderer.invoke('read-directory', dirPath, scanId),
  cancelDirectoryScan: (scanId) => ipcRenderer.invoke('cancel-directory-scan', scanId),
  onDirectoryScanProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('directory-scan-progress', listener);
    return () => ipcRenderer.removeListener('directory-scan-progress', listener);
  },
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
  updatePlaybackState: (state) => ipcRenderer.invoke('update-playback-state', state),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  castGetDevices: () => ipcRenderer.invoke('cast-get-devices'),
  castScan: () => ipcRenderer.invoke('cast-scan'),
  castToDevice: (device) => ipcRenderer.invoke('cast-to-device', device),
  castStop: (device) => ipcRenderer.invoke('cast-stop', device),
  ytResolveId: (options) => ipcRenderer.invoke('yt-resolve-id', options),
  ytDownloadTempAudio: (options) => ipcRenderer.invoke('yt-download-temp-audio', options),
  ytDownloadTempCover: (options) => ipcRenderer.invoke('yt-download-temp-cover', options),
  ytPackageAudio: (options) => ipcRenderer.invoke('yt-package-audio', options),
  ytFetchSaveLyrics: (options) => ipcRenderer.invoke('yt-fetch-save-lyrics', options),
  ytCleanupTempFiles: (options) => ipcRenderer.invoke('yt-cleanup-temp-files', options),
  onCastPlaybackChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('cast-playback-changed', listener);
    return () => ipcRenderer.removeListener('cast-playback-changed', listener);
  },
  onCastSkipTrack: (callback) => {
    const listener = (event, direction) => callback(direction);
    ipcRenderer.on('cast-skip-track', listener);
    return () => ipcRenderer.removeListener('cast-skip-track', listener);
  },
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  updateTrackMetadata: (options) => ipcRenderer.invoke('update-track-metadata', options),
  updatePlaylistMetadata: (options) => ipcRenderer.invoke('update-playlist-metadata', options),
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),
  exportPlaylist: (options) => ipcRenderer.invoke('export-playlist', options),
  enterMiniPlayer: () => ipcRenderer.invoke('enter-mini-player'),
  exitMiniPlayer: () => ipcRenderer.invoke('exit-mini-player'),
  onMiniPlayerChanged: (callback) => {
    const listener = (event, isMini) => callback(isMini);
    ipcRenderer.on('mini-player-changed', listener);
    return () => ipcRenderer.removeListener('mini-player-changed', listener);
  },
  onExportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('export-playlist-progress', listener);
    return () => ipcRenderer.removeListener('export-playlist-progress', listener);
  }
});
