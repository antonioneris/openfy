import path from 'path';

// Get the project root path dynamically
const PROJECT_ROOT = process.cwd();
const LIBRARY_PATH = path.join(PROJECT_ROOT, 'e2e', 'fixtures', 'test-library');
const DOWNLOADS_PATH = path.join(PROJECT_ROOT, 'e2e', 'downloads');

export const MOCK_SPOTIFY_PLAYLIST = {
  id: '4iVma1T5JWR8T8PqVpBlyH',
  name: 'Playlist de Teste E2E',
  artist: 'Artista Teste',
  coverUrl: 'https://via.placeholder.com/300/1DB954/ffffff?text=Test+Playlist',
  tracks: [
    { id: 'track-1', name: 'Música Teste 1', artist: { name: 'Artista A' }, album: { name: 'Álbum A' }, duration: 180, videoId: 'mock-video-1', thumbnails: [{ url: '', width: 640, height: 640 }] },
    { id: 'track-2', name: 'Música Teste 2', artist: { name: 'Artista B' }, album: { name: 'Álbum B' }, duration: 240, videoId: 'mock-video-2', thumbnails: [{ url: '', width: 640, height: 640 }] },
    { id: 'track-3', name: 'Música Teste 3', artist: { name: 'Artista C' }, album: { name: 'Álbum C' }, duration: 200, videoId: 'mock-video-3', thumbnails: [{ url: '', width: 640, height: 640 }] },
  ]
};

export const MOCK_LIBRARY_PATH = LIBRARY_PATH;
export const MOCK_DOWNLOADS_PATH = DOWNLOADS_PATH;

export const MOCK_TRACKS = [
  {
    id: 'local-1',
    title: 'Test Song One',
    artist: 'Test Artist A',
    album: 'Test Album A',
    duration: 3.0,
    filePath: LIBRARY_PATH + '/test-song-1.mp3',
    fileName: 'test-song-1.mp3',
    lastModified: Date.now(),
    hasLrcFile: false,
    isFavorite: false,
    playCount: 0,
    coverArt: '',
    dominantColor: '#1DB954',
  },
  {
    id: 'local-2',
    title: 'Test Song Two',
    artist: 'Test Artist B',
    album: 'Test Album B',
    duration: 4.0,
    filePath: LIBRARY_PATH + '/test-song-2.mp3',
    fileName: 'test-song-2.mp3',
    lastModified: Date.now(),
    hasLrcFile: false,
    isFavorite: false,
    playCount: 0,
    coverArt: '',
    dominantColor: '#1a1a2e',
  },
];

export const ELECTRON_API_SCRIPT = `
  (function() {
    var MOCK_TRACKS = ${JSON.stringify(MOCK_TRACKS)};
    var LIBRARY_PATH = ${JSON.stringify(LIBRARY_PATH)};
    var DOWNLOADS_PATH = ${JSON.stringify(DOWNLOADS_PATH)};
    var MOCK_PLAYLIST = ${JSON.stringify(MOCK_SPOTIFY_PLAYLIST)};
    var MOCK_PLAYLISTS = [{ id: 'pl-1', name: 'Minha Playlist', cover: '', trackCount: 2 }];

    window.electronAPI = {
      isElectron: true,
      platform: 'darwin',

      // Database (SQLite WASM)
      loadDatabase: function() { return Promise.resolve(null); },
      saveDatabase: function() { return Promise.resolve(true); },
      getWasmBinary: function() { return null; },

      // Library - select folder returns the test-library path
      selectFolder: function() { return Promise.resolve(LIBRARY_PATH); },
      authorizeFolder: function() { return Promise.resolve(true); },
      cancelDirectoryScan: function() { return Promise.resolve(true); },
      onDirectoryScanProgress: function() { return function() {}; },
      readDirectory: function(dirPath) {
        if (sessionStorage.getItem('mock-folder-permission-denied') === 'true') {
          return Promise.reject(new Error('FOLDER_NOT_AUTHORIZED:' + dirPath));
        }
        return Promise.resolve([
          { filePath: LIBRARY_PATH + '/test-song-1.mp3', fileName: 'test-song-1.mp3', lastModified: Date.now(), hasLrc: false },
          { filePath: LIBRARY_PATH + '/test-song-2.mp3', fileName: 'test-song-2.mp3', lastModified: Date.now(), hasLrc: false },
        ]);
      },
      readFile: function() { return Promise.resolve(new ArrayBuffer(1024)); },
      readTextFile: function() { return Promise.resolve(''); },
      deleteFile: function() { return Promise.resolve({ success: true }); },
      deleteFolder: function() { return Promise.resolve(true); },
      getFolderContents: function() { return Promise.resolve([]); },
      importLocalFiles: function() { return Promise.resolve(); },

      // Playlists
      getPlaylists: function() { return Promise.resolve(MOCK_PLAYLISTS); },
      createPlaylist: function(name) { return Promise.resolve({ id: 'pl-new', name: name }); },
      deletePlaylist: function() { return Promise.resolve(true); },
      addToPlaylist: function() { return Promise.resolve(true); },
      removeFromPlaylist: function() { return Promise.resolve(true); },
      toggleFavorite: function() { return Promise.resolve(true); },
      incrementPlayCount: function() { return Promise.resolve(true); },
      updateLastPlayed: function() { return Promise.resolve(true); },

      // Spotify - resolves the playlist URL
      resolveSpotifyUrl: function(url) {
        if (url.indexOf('spotify.com/playlist/') !== -1) {
          return Promise.resolve(MOCK_PLAYLIST);
        }
        return Promise.resolve(null);
      },

      // Autocomplete - detects Spotify playlist URLs
      getSearchAutocomplete: function(q) {
        if (q.indexOf('spotify.com/playlist/') !== -1) {
          return Promise.resolve({ suggestions: [], playlist: MOCK_PLAYLIST });
        }
        return Promise.resolve({ suggestions: [], playlist: null });
      },

      // YouTube Music search
      searchYouTubeMusic: function(q) {
        return Promise.resolve({
          songs: [
            { videoId: 'yt-1', name: 'YT Result 1', artist: { name: 'YT Artist 1' }, duration: 210, thumbnails: [] },
            { videoId: 'yt-2', name: 'YT Result 2', artist: { name: 'YT Artist 2' }, duration: 195, thumbnails: [] },
          ],
          artists: [],
          albums: [],
          playlists: []
        });
      },
      getPlaylistDetails: function(id) {
        return Promise.resolve({
          name: 'YT Playlist',
          artist: { name: 'YT Artist' },
          thumbnails: [{ url: 'https://via.placeholder.com/300' }],
          tracks: []
        });
      },
      getAlbumTracks: function() { return Promise.resolve([]); },

      // Downloads - uses the real downloads path
      downloadSong: function(opts) {
        return Promise.resolve({ status: 'success', filepath: DOWNLOADS_PATH + '/' + opts.title + '.m4a', hasLrc: false });
      },
      ytResolveId: function(opts) { return Promise.resolve({ videoId: 'resolved-' + opts.id }); },
      ytDownloadTempAudio: function() { return Promise.resolve('/tmp/audio.m4a'); },
      ytDownloadTempCover: function() { return Promise.resolve('/tmp/cover.jpg'); },
      ytPackageAudio: function(opts) { return Promise.resolve(DOWNLOADS_PATH + '/' + opts.title + '.m4a'); },
      ytFetchSaveLyrics: function() { return Promise.resolve({ lrcContent: '', hasLrc: false }); },
      ytCleanupTempFiles: function() { return Promise.resolve(true); },

      // Window
      enterMiniPlayer: function() { return Promise.resolve(); },
      exitMiniPlayer: function() { return Promise.resolve(); },
      openExternal: function() { return Promise.resolve(true); },
      updatePlaybackState: function() { return Promise.resolve(true); },

      // Cast
      getLocalIp: function() { return Promise.resolve('192.168.1.100'); },
      castGetDevices: function() { return Promise.resolve([]); },
      castScan: function() { return Promise.resolve([]); },
      castToDevice: function() { return Promise.resolve({ status: 'connected' }); },
      castStop: function() { return Promise.resolve({ status: 'stopped' }); },

      // Event listeners (no-op)
      onCastPlaybackChanged: function() { return function() {}; },
      onCastSkipTrack: function() { return function() {}; },
      onMiniPlayerChanged: function() { return function() {}; },
    };
  })();
`;
