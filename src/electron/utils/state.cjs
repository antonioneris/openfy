/**
 * Shared state module for the Electron main process.
 * Stores references to the main window, playback state, cast connections, and binary paths.
 */
const state = {
  mainWindow: null,
  currentPlaybackState: {
    title: '',
    artist: '',
    album: '',
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    lyrics: [],
    coverArt: '',
    filePath: '',
    hasPrev: false,
    hasNext: false,
    prevTrack: null,
    nextTrack: null
  },
  sseClients: [],
  discoveredCastDevices: [],
  activeCastClient: null,
  activeCastPlayer: null,
  activeCastHost: null,
  lastKnownCastState: { isPlaying: false, currentTime: 0 },
  castQueueItems: { prevId: null, currentId: null, nextId: null },
  bonjourInstance: null,
  bonjourBrowser: null,
  localBinDir: '',
  localFfmpegPath: '',
  localFfprobePath: '',
  localYtdlpPath: ''
};

module.exports = state;
