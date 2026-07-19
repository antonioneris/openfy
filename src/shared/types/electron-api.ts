export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  saveDatabase: (arrayBuffer: ArrayBuffer) => Promise<boolean>;
  loadDatabase: () => Promise<ArrayBuffer | null>;
  getWasmBinary: () => ArrayBuffer | null;
  searchYouTubeMusic: (query: string) => Promise<any>;
  downloadSong: (options: {
    id: string;
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
    duration: number | null;
    downloadDir: string;
    genre?: string;
    year?: number | null;
    skipMetadataFetch?: boolean;
  }) => Promise<{ status: string; filepath: string; lrcContent?: string; hasLrc?: boolean }>;
  getAlbumTracks: (albumId: string) => Promise<any>;
  getYtArtistDetails: (artistId: string) => Promise<any>;
  getPlaylistTracks: (playlistId: string) => Promise<any>;
  getPlaylistDetails: (playlistId: string) => Promise<any>;
  getSearchAutocomplete: (query: string) => Promise<{ suggestions: string[]; artists: any[] }>;
  resolveSpotifyUrl: (url: string, credentials?: { clientId: string; clientSecret: string }) => Promise<any>;
  selectFolder: () => Promise<string | null>;
  authorizeFolder: (dirPath: string) => Promise<boolean>;
  readDirectory: (dirPath: string, scanId?: string) => Promise<{ filePath: string; fileName: string; lastModified: number; hasLrc: boolean }[]>;
  cancelDirectoryScan?: (scanId: string) => Promise<boolean>;
  onDirectoryScanProgress?: (callback: (progress: { scanId: string; discovered: number }) => void) => () => void;
  readFile: (filePath: string) => Promise<ArrayBuffer>;
  readTextFile: (filePath: string) => Promise<string | null>;
  updatePlaybackState: (state: any) => Promise<boolean>;
  getLocalIp: () => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
  castGetDevices: () => Promise<{ name: string; host: string; port: number; id: string }[]>;
  castScan: () => Promise<{ name: string; host: string; port: number; id: string }[]>;
  castToDevice: (device: { host: string; port: number }) => Promise<{ success: boolean }>;
  castStop: (device: { host: string; port: number }) => Promise<boolean>;
  ytResolveId: (options: { id: string; title: string; artist: string }) => Promise<{ videoId: string; coverUrl?: string; albumName?: string } | string>;
  ytDownloadTempAudio: (options: { videoId: string }) => Promise<string>;
  ytDownloadTempCover: (options: { videoId: string; coverUrl: string }) => Promise<string>;
  ytPackageAudio: (options: {
    tempAudioPath: string;
    tempCoverPath: string;
    title: string;
    artist: string;
    album: string;
    genre?: string;
    year?: number | null;
    downloadDir: string;
    videoId: string;
  }) => Promise<string>;
  ytFetchSaveLyrics: (options: {
    title: string;
    artist: string;
    album: string;
    duration: number | null;
    finalFilePath: string;
    videoId: string;
  }) => Promise<{ lrcContent: string; hasLrc: boolean }>;
  ytCleanupTempFiles: (options: { tempAudioPath: string; tempCoverPath: string }) => Promise<boolean>;
  onCastPlaybackChanged?: (callback: (data: { isPlaying: boolean; currentTime: number | null }) => void) => () => void;
  onCastSkipTrack?: (callback: (direction: 'next' | 'prev') => void) => () => void;
  deleteFile?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  updateTrackMetadata?: (options: {
    filePath: string;
    metadata: {
      title?: string;
      artist?: string;
      album?: string;
      year?: number | null;
      trackNumber?: number | null;
      genre?: string | null;
    };
    coverArt?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
  updatePlaylistMetadata?: (options: {
    playlistId: string;
    metadata: {
      name?: string;
      coverUrl?: string | null;
    };
  }) => Promise<{ success: boolean; error?: string }>;
  selectImageFile?: () => Promise<{ filePath: string; dataUrl: string } | null>;
  exportPlaylist?: (options: {
    playlistName: string;
    tracks: Array<{
      id: string;
      filePath: string;
      title: string;
      artist: string;
      album: string;
      year?: number | null;
      genre?: string | null;
      hasLrcFile?: boolean;
    }>;
  }) => Promise<{ success: boolean; successCount: number; failCount: number; path?: string; error?: string }>;
  onExportProgress?: (callback: (data: { current: number; total: number; title: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
