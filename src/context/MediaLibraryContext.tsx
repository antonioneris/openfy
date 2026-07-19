import React, { createContext, useContext, useEffect, useRef } from 'react';
import type { Track, Playlist, ActiveView, ViewParams, QueuedDownload } from '../shared/types';
import { 
  loadCachedLibrary, 
  saveLibraryToCache, 
  scanDirectoryHandle, 
  saveDirectoryHandle, 
  getSavedDirectoryHandles,
  removeDirectoryHandle,
  scanFileList,
  loadCachedPlaylists,
  savePlaylistsToCache,
  incrementPlayCount,
  toggleFavorite,
  extractEmbeddedLyrics,
  blobToDataURL,
  createScanCancelledError,
  isScanCancelledError,
  withOperationTimeout,
  isFolderManifestUnchanged,
  getYouTubeIdFromTrack,
  isTrackInFolder,
  removeTrackOfflineBlob
} from '../utils/libraryEngine';
import { parseLRC } from '../utils/lrcParser';
import type { LyricLine } from '../utils/lrcParser';
import * as mm from 'music-metadata-browser';
import { isElectron, isOnlineCapable } from '../services/platformService';

import { useNavigation } from '../features/navigation/context/NavigationContext';
import { useUI } from '../features/ui/context/UIContext';
import { useSearch } from '../features/search/context/SearchContext';
import { useDownload } from '../features/downloads/context/DownloadContext';
import { useLibrary } from '../features/library/context/LibraryContext';
import type { LibraryStatus } from '../features/library/context/LibraryContext';
import { usePlaylist } from '../features/playlists/context/PlaylistContext';
import { useQueue } from '../features/queue/context/QueueContext';
import { usePlayback } from '../features/playback/context/PlaybackContext';

import { get, set } from 'idb-keyval';
import { updateTrackMetadataInSQLite, updatePlaylistMetadataInSQLite } from '../utils/sqliteDatabase';
import { recordFirstAudioMetric, recordPerformanceMetric } from '../services/performanceMetrics';

interface MediaLibraryContextType {
  tracks: Track[];
  folders: string[];
  playlists: Playlist[];
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  queueIndex: number;
  isShuffle: boolean;
  repeatMode: 'none' | 'all' | 'one';
  currentView: ActiveView;
  viewParams: ViewParams;
  lyrics: LyricLine[];
  isLoading: boolean;
  libraryStatus: LibraryStatus;
  
  // Controls
  playTrack: (track: Track, newQueue?: Track[], preserveQueue?: boolean) => Promise<void>;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
  seek: (seconds: number) => void;
  changeVolume: (vol: number) => void;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  setView: (view: ActiveView, params?: ViewParams) => void;
  goBack: () => void;
  triggerNativeAirPlay: () => void;
  
  // Library Actions
  scanLocalFolder: () => Promise<void>;
  importLocalFiles: (files: FileList | File[], shouldSaveOffline?: boolean) => Promise<void>;
  deleteFolder: (folderName: string) => Promise<void>;
  checkPermissionsAndReload: () => Promise<void>;
  reauthorizeLibraryFolder: (folder?: string) => Promise<boolean>;
  cancelLibraryScan: () => void;
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>;

  // Playlist Actions
  createPlaylist: (name: string, trackIds?: string[], ytPlaylistId?: string, coverUrl?: string) => Promise<string>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  updatePlaylistTrackIds: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  toggleTrackFavorite: (trackId: string) => Promise<void>;
  deleteTrack: (trackId: string) => Promise<void>;
  deleteAlbum: (albumName: string) => Promise<void>;
  updateTrackMetadata: (trackId: string, metadata: Partial<Track>) => Promise<boolean>;
  updatePlaylistMetadata: (playlistId: string, metadata: Partial<Playlist>) => Promise<boolean>;

  // Queue Actions
  addToQueue: (track: Track) => void;
  addToQueueNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;

  // Custom Modal dialogs
  showAlert: (title: string, message: string) => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
  showPrompt: (title: string, message: string, defaultValue?: string) => Promise<string | null>;
  isCasting: boolean;
  setIsCasting: (casting: boolean) => void;

  // Batch Downloads Actions/State
  downloadQueue: QueuedDownload[];
  addTracksToDownloadQueue: (tracksToAdd: {
    videoId: string;
    name: string;
    artist: string;
    album: string;
    coverUrl: string;
    duration: number | null;
    genre?: string;
    year?: number | null;
  }[]) => void;
  clearDownloadQueue: () => void;

  // Persistent search states
  ytSearchQuery: string;
  setYtSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  ytSearchMode: 'local' | 'youtube';
  setYtSearchMode: React.Dispatch<React.SetStateAction<'local' | 'youtube'>>;
  ytSearchResults: any | null;
  setYtSearchResults: React.Dispatch<React.SetStateAction<any | null>>;
  ytSearchCategory: string;
  setYtSearchCategory: React.Dispatch<React.SetStateAction<string>>;
  isMiniPlayer: boolean;
  enterMiniPlayer: () => void;
  exitMiniPlayer: () => void;
}


const MediaLibraryContext = createContext<MediaLibraryContextType | undefined>(undefined);
const AUDIO_FILE_EXTENSION = /\.(mp3|m4a|flac|ogg|wav|aac)$/i;

function getAudioMimeType(filePath: string): string {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return ({
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
  } as Record<string, string>)[extension] || 'application/octet-stream';
}

export const useMediaLibrary = () => {
  const context = useContext(MediaLibraryContext);
  if (!context) {
    throw new Error('useMediaLibrary deve ser usado dentro de um MediaLibraryProvider');
  }
  return context;
};

export const MediaLibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentView, viewParams, setView, goBack } = useNavigation();
  const { 
    isMiniPlayer, enterMiniPlayer, exitMiniPlayer, 
    isCasting, setIsCasting, 
    modalConfig, setModalConfig, 
    promptInputValue, setPromptInputValue, 
    lyrics, setLyrics, 
    showAlert, showConfirm, showPrompt 
  } = useUI();
  const { 
    ytSearchQuery, setYtSearchQuery, 
    ytSearchMode, setYtSearchMode, 
    ytSearchResults, setYtSearchResults, 
    ytSearchCategory, setYtSearchCategory 
  } = useSearch();
  const { downloadQueue, setDownloadQueue } = useDownload();
  const { tracks, setTracks, tracksRef, folders, setFolders, isLoading, setIsLoading, libraryStatus, setLibraryStatus } = useLibrary();
  const { playlists, setPlaylists } = usePlaylist();
  const { queue, setQueue, queueIndex, setQueueIndex, isShuffle, setIsShuffle, repeatMode, setRepeatMode } = useQueue();
  const { currentTrack, setCurrentTrack, isPlaying, setIsPlaying, currentTime, setCurrentTime, duration, setDuration, volume, setVolume } = usePlayback();

  const isScanningRef = useRef(false);
  const pendingFolderSelectionRef = useRef(false);
  const activeScanRef = useRef<{ cancelled: boolean; id?: string } | null>(null);

  const cancelLibraryScan = () => {
    if (!activeScanRef.current) return;
    activeScanRef.current.cancelled = true;
    if (activeScanRef.current.id && window.electronAPI?.cancelDirectoryScan) {
      void window.electronAPI.cancelDirectoryScan(activeScanRef.current.id);
    }
    pendingFolderSelectionRef.current = false;
    setLibraryStatus({ phase: 'idle' });
  };

  useEffect(() => {
    if (!window.electronAPI?.onDirectoryScanProgress) return;
    return window.electronAPI.onDirectoryScanProgress(({ scanId, discovered }) => {
      if (activeScanRef.current?.id !== scanId || activeScanRef.current.cancelled) return;
      setLibraryStatus(previous => {
        if (previous.phase !== 'refreshing' && previous.phase !== 'scanning') return previous;
        return { ...previous, processed: discovered, total: undefined };
      });
    });
  }, [setLibraryStatus]);

  // Sync casting state with local audio mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isCasting;
    }
  }, [isCasting]);

  // Audio elements references
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);

  // State Refs to prevent stale closures and React lifecycle updates from recreating Audio
  const playbackStateRef = useRef({
    queue,
    queueIndex,
    repeatMode,
    isShuffle,
    tracks
  });

  useEffect(() => {
    playbackStateRef.current = {
      queue,
      queueIndex,
      repeatMode,
      isShuffle,
      tracks
    };
  });

  const currentTrackRef = useRef(currentTrack);
  const playTimeIncrementedRef = useRef(false);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    playTimeIncrementedRef.current = false;
  }, [currentTrack]);

  const handleSongEndedRef = useRef<(() => void) | undefined>(undefined);
  handleSongEndedRef.current = () => {
    const { repeatMode } = playbackStateRef.current;
    if (repeatMode === 'one') {
      if (audioRef.current) {
        playTimeIncrementedRef.current = false;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(console.error);
      }
    } else {
      playNext();
    }
  };

  // Initialize Audio ONCE on mount
  useEffect(() => {
    const audio = new Audio();
    const savedVol = localStorage.getItem('spotify_local_volume');
    audio.volume = savedVol ? parseFloat(savedVol) : 1;
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      const track = currentTrackRef.current;
      if (track && audio.currentTime >= 10 && !playTimeIncrementedRef.current) {
        playTimeIncrementedRef.current = true;
        incrementPlayCount(track.id).then(stats => {
          if (stats) {
            setTracks(prevTracks => prevTracks.map(t => {
              if (t.id === track.id) {
                return { ...t, playCount: stats.playCount, lastPlayed: stats.lastPlayed };
              }
              return t;
            }));
          }
        }).catch(err => {
          console.warn('Failed to increment play count in state:', err);
        });
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      if (handleSongEndedRef.current) {
        handleSongEndedRef.current();
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      }
    };
  }, []); // Empty dependency array

  // Load Library from cache on start
  useEffect(() => {
    async function init() {
      setLibraryStatus({ phase: 'initializing' });
      try {
        const cachedTracks = await loadCachedLibrary();
        tracksRef.current = cachedTracks;
        setTracks(cachedTracks);
        
        const cachedFolders = await get<string[]>('spotify_local_folders') || [];
        setFolders(cachedFolders);

        const cachedPlaylists = await loadCachedPlaylists();
        setPlaylists(cachedPlaylists);

        // Paint the cached library first. Validation runs on the next task so a
        // large folder can never delay time-to-first-content on subsequent opens.
        if (cachedTracks.length > 0) {
          setLibraryStatus({ phase: 'idle' });
          setTimeout(() => { void checkPermissionsAndReload(cachedTracks); }, 0);
        } else {
          await checkPermissionsAndReload(cachedTracks);
        }
      } catch (err) {
        console.error('Erro ao inicializar biblioteca:', err);
        setLibraryStatus({ phase: 'error', message: 'Não foi possível carregar a biblioteca.' });
      } finally {
        setLibraryStatus(previous => previous.phase === 'permission-required' || previous.phase === 'error'
          ? previous
          : { phase: 'idle' });
      }
    }
    init();
  }, []);

  // Update Media Session Metadata when current song changes
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          artwork: currentTrack.coverArt ? [{ src: currentTrack.coverArt }] : []
        });

        navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play());
        navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      }

      // Parse lyrics
      if (currentTrack.lrcContent) {
        setLyrics(parseLRC(currentTrack.lrcContent));
      } else {
        setLyrics([]);
      }
    }
  }, [currentTrack]);

  // Synchronize playback state with Cast Server in Electron (Server-Sent Events)
  const lastSyncTimeRef = useRef<number>(0);
  const lastSyncStateRef = useRef<{ trackId: string | null; isPlaying: boolean }>({ trackId: null, isPlaying: false });

  useEffect(() => {
    if (!window.electronAPI?.isElectron || !window.electronAPI.updatePlaybackState) return;

    const trackId = currentTrack?.id || null;
    const timeDiff = Math.abs(currentTime - lastSyncTimeRef.current);
    const stateChanged = lastSyncStateRef.current.trackId !== trackId || lastSyncStateRef.current.isPlaying !== isPlaying;

    // Throttle: only update if track or play/pause state changed, or if time drifted/seeked by > 1.5 seconds
    if (stateChanged || timeDiff > 1.5) {
      lastSyncTimeRef.current = currentTime;
      lastSyncStateRef.current = { trackId, isPlaying };

      if (!currentTrack) {
        window.electronAPI.updatePlaybackState({
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
        }).catch(console.error);
      } else {
        const prevTrack = queueIndex > 0 ? queue[queueIndex - 1] : null;
        const nextTrack = queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : null;

        window.electronAPI.updatePlaybackState({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          duration: duration || 0,
          currentTime: currentTime || 0,
          isPlaying: isPlaying,
          lyrics: lyrics.map(l => ({ time: l.time, text: l.text })),
          coverArt: currentTrack.coverArt || '',
          filePath: currentTrack.filePath || '',
          hasPrev: !!prevTrack,
          hasNext: !!nextTrack,
          prevTrack: prevTrack ? {
            title: prevTrack.title,
            artist: prevTrack.artist,
            album: prevTrack.album,
            coverArt: prevTrack.coverArt || '',
            filePath: prevTrack.filePath || ''
          } : null,
          nextTrack: nextTrack ? {
            title: nextTrack.title,
            artist: nextTrack.artist,
            album: nextTrack.album,
            coverArt: nextTrack.coverArt || '',
            filePath: nextTrack.filePath || ''
          } : null
        }).catch(console.error);
      }
    }
  }, [currentTrack, isPlaying, lyrics, currentTime, duration, queue, queueIndex]);

  // Verify permission and reload folder contents
  const checkPermissionsAndReload = async (seedTracks: Track[] = tracksRef.current) => {
    if (isScanningRef.current) {
      console.log('[MediaLibraryContext] Scan already in progress, skipping checkPermissionsAndReload.');
      return;
    }
    isScanningRef.current = true;
    const scanStartedAt = performance.now();
    const scan = { cancelled: false, id: `library-refresh-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    activeScanRef.current = scan;

    if (window.electronAPI?.isElectron) {
      try {
        const cachedFolders = await get<string[]>('spotify_local_folders') || [];
        if (cachedFolders.length === 0) {
          setLibraryStatus({ phase: 'idle' });
          return;
        }

        setLibraryStatus({ phase: 'refreshing' });
        let updatedTracks = [...seedTracks];
        let permissionRequiredFolder = '';
        let libraryChanged = false;

        for (const folderPath of cachedFolders) {
          setLibraryStatus({ phase: 'refreshing', folder: folderPath });
          try {
            const files = await window.electronAPI.readDirectory(folderPath, scan.id);
            const cachedFolderTracks = updatedTracks.filter(track => isTrackInFolder(track.filePath, folderPath));
            const folderIsUnchanged = isFolderManifestUnchanged(files, cachedFolderTracks);

            if (folderIsUnchanged) {
              continue;
            }

            libraryChanged = true;
            const scannedTracks: Track[] = [];

            for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
              if (scan.cancelled) throw createScanCancelledError();
              const file = files[fileIndex];
              setLibraryStatus({ phase: 'refreshing', folder: folderPath, processed: fileIndex, total: files.length });
              const existing = updatedTracks.find(t => t.filePath === file.filePath);
              if (existing && existing.lastModified === file.lastModified) {
                scannedTracks.push(existing);
                setLibraryStatus({ phase: 'refreshing', folder: folderPath, processed: fileIndex + 1, total: files.length });
                continue;
              }

              // Load file metadata
              try {
                const buffer = await withOperationTimeout(window.electronAPI.readFile(file.filePath), 10000, 'FILE_READ_TIMEOUT');
                const blob = new Blob([buffer]);
                const metadata = await withOperationTimeout(mm.parseBlob(blob), 10000, 'METADATA_TIMEOUT');

                let coverArt: string | undefined;
                if (metadata.common.picture && metadata.common.picture.length > 0) {
                  const pic = metadata.common.picture[0];
                  const picBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
                  coverArt = await blobToDataURL(picBlob);
                }

                const embeddedLyrics = extractEmbeddedLyrics(metadata);
                let lrcContent = embeddedLyrics;
                if (file.hasLrc) {
                  const ext = file.filePath.substring(file.filePath.lastIndexOf('.'));
                  const lrcPath = file.filePath.substring(0, file.filePath.length - ext.length) + '.lrc';
                  const text = await withOperationTimeout(window.electronAPI.readTextFile(lrcPath), 5000, 'LYRICS_READ_TIMEOUT');
                  if (text) lrcContent = text;
                }

                const genre = metadata.common.genre && metadata.common.genre.length > 0 
                  ? metadata.common.genre[0] 
                  : undefined;

                scannedTracks.push({
                  id: file.filePath,
                  title: metadata.common.title || file.fileName.replace(AUDIO_FILE_EXTENSION, ''),
                  artist: metadata.common.artist || 'Artista Desconhecido',
                  album: metadata.common.album || 'Álbum Desconhecido',
                  duration: metadata.format.duration || 0,
                  trackNumber: metadata.common.track.no || undefined,
                  year: metadata.common.year || undefined,
                  coverArt,
                  embeddedLyrics,
                  fileName: file.fileName,
                  filePath: file.filePath,
                  lastModified: file.lastModified,
                  hasLrcFile: file.hasLrc,
                  lrcContent,
                  genre,
                  playCount: existing ? (existing.playCount || 0) : 0,
                  lastPlayed: existing ? (existing.lastPlayed || 0) : 0,
                  isFavorite: existing ? !!existing.isFavorite : false
                });
              } catch (metaErr) {
                console.error('Failed to parse metadata in background:', file.filePath, metaErr);
                scannedTracks.push({
                  id: file.filePath,
                  title: file.fileName.replace(AUDIO_FILE_EXTENSION, ''),
                  artist: 'Artista Desconhecido',
                  album: 'Álbum Desconhecido',
                  duration: 0,
                  fileName: file.fileName,
                  filePath: file.filePath,
                  lastModified: file.lastModified,
                  hasLrcFile: file.hasLrc,
                  playCount: existing ? (existing.playCount || 0) : 0,
                  lastPlayed: existing ? (existing.lastPlayed || 0) : 0,
                  isFavorite: existing ? !!existing.isFavorite : false
                });
              }
              setLibraryStatus({ phase: 'refreshing', folder: folderPath, processed: fileIndex + 1, total: files.length });
            }

            // Filter out existing tracks belonging to this folder path to avoid duplicates
            const otherTracks = updatedTracks.filter(t => !isTrackInFolder(t.filePath, folderPath));
            updatedTracks = [...otherTracks, ...scannedTracks];
          } catch (folderErr) {
            if (isScanCancelledError(folderErr)) throw folderErr;
            console.error('Failed to scan folder in background:', folderPath, folderErr);
            if (String(folderErr).includes('FOLDER_NOT_AUTHORIZED')) {
              permissionRequiredFolder = folderPath;
            }
          }
        }

        if (scan.cancelled) throw createScanCancelledError();
        if (libraryChanged) {
          setTracks(updatedTracks);
        }
        setFolders(cachedFolders);
        if (libraryChanged) {
          await saveLibraryToCache(updatedTracks, cachedFolders);
        }
        setLibraryStatus(permissionRequiredFolder
          ? { phase: 'permission-required', folder: permissionRequiredFolder }
          : { phase: 'idle' });
      } catch (err) {
        if (isScanCancelledError(err)) {
          setLibraryStatus({ phase: 'idle' });
        } else {
          console.warn('Error in background scan:', err);
          setLibraryStatus({ phase: 'error', message: 'Não foi possível atualizar a biblioteca.' });
        }
      } finally {
        recordPerformanceMetric('library-indexation', performance.now() - scanStartedAt, {
          source: 'refresh-electron',
          trackCount: tracksRef.current.length,
          cancelled: scan.cancelled,
        });
        if (activeScanRef.current === scan) activeScanRef.current = null;
        isScanningRef.current = false;
        if (pendingFolderSelectionRef.current) {
          pendingFolderSelectionRef.current = false;
          setTimeout(() => { void scanLocalFolder(); }, 0);
        }
      }
      return;
    }

    try {
      const handles = await getSavedDirectoryHandles();
      if (handles.length === 0) {
        setLibraryStatus({ phase: 'idle' });
        isScanningRef.current = false;
        return;
      }

      setLibraryStatus({ phase: 'refreshing' });
      let updatedTracks: Track[] = [...tracksRef.current];
      const updatedFolders: string[] = [];

      for (const handle of handles) {
        if (scan.cancelled) throw createScanCancelledError();
        if (!handle || typeof (handle as any).queryPermission !== 'function') {
          // If the handle is invalid or not a function (e.g. on Android/browser fallback), skip
          if (handle && handle.name && !updatedFolders.includes(handle.name)) {
            updatedFolders.push(handle.name);
          }
          continue;
        }

        // Check if we still have read permission
        const opt = { mode: 'read' as const };
        if ((await (handle as any).queryPermission(opt)) === 'granted') {
          const { tracks: scanned } = await scanDirectoryHandle(
            handle, 
            new Map(tracksRef.current.map(t => [t.filePath, t])),
            (processed, total) => setLibraryStatus({ phase: 'refreshing', folder: handle.name, processed, total }),
            () => scan.cancelled
          );
          
          // Merge scanned tracks, replace any matching folder tracks
          const otherTracks = updatedTracks.filter(t => !isTrackInFolder(t.filePath, handle.name));
          updatedTracks = [...otherTracks, ...scanned];
          if (!updatedFolders.includes(handle.name)) {
            updatedFolders.push(handle.name);
          }
        } else {
          if (!updatedFolders.includes(handle.name)) {
            updatedFolders.push(handle.name);
          }
        }
      }

      if (scan.cancelled) throw createScanCancelledError();
      setTracks(updatedTracks);
      setFolders(updatedFolders);
      await saveLibraryToCache(updatedTracks, updatedFolders);
    } catch (err) {
      if (!isScanCancelledError(err)) {
        console.warn('Skipped permission check or reload:', err);
        setLibraryStatus({ phase: 'error', message: 'Não foi possível atualizar a biblioteca.' });
      }
    } finally {
      recordPerformanceMetric('library-indexation', performance.now() - scanStartedAt, {
        source: 'refresh-browser',
        trackCount: tracksRef.current.length,
        cancelled: scan.cancelled,
      });
      if (activeScanRef.current === scan) activeScanRef.current = null;
      isScanningRef.current = false;
      setLibraryStatus(previous => previous.phase === 'error' ? previous : { phase: 'idle' });
    }
  };

  // Helper to resolve track file handle on-the-fly
  const resolveFileHandle = async (track: Track): Promise<FileSystemFileHandle | null> => {
    try {
      const handles = await getSavedDirectoryHandles();
      for (const handle of handles) {
        if (!handle || typeof (handle as any).queryPermission !== 'function' || typeof (handle as any).requestPermission !== 'function') {
          continue;
        }
        
        const prefix = handle.name + '/';
        if (track.filePath.startsWith(prefix)) {
          // Request permission if not granted
          const opt = { mode: 'read' as const };
          let permissionStatus = await (handle as any).queryPermission(opt);
          if (permissionStatus !== 'granted') {
            permissionStatus = await (handle as any).requestPermission(opt);
            if (permissionStatus !== 'granted') {
              return null;
            }
          }
          
          // Navigate to the file handle
          const relativePath = track.filePath.substring(prefix.length);
          const parts = relativePath.split('/');
          let currentHandle = handle;
          for (let i = 0; i < parts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
          }
          return await currentHandle.getFileHandle(parts[parts.length - 1]);
        }
      }
    } catch (err) {
      console.error('Erro ao resolver fileHandle:', err);
    }
    return null;
  };

  // Play a specific track
  const playTrack = async (track: Track, newQueue?: Track[], preserveQueue = false) => {
    if (!audioRef.current) return;
    const playbackStartedAt = performance.now();

    // Set queue
    if (!preserveQueue) {
      if (newQueue) {
        setQueue(newQueue);
        const index = newQueue.findIndex(t => t.id === track.id);
        setQueueIndex(index >= 0 ? index : 0);
      } else {
        // If no queue is provided, find track in library and set library as queue
        const index = tracks.findIndex(t => t.id === track.id);
        setQueue(tracks);
        setQueueIndex(index >= 0 ? index : 0);
      }
    }

    try {
      // Revoke old URL
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }

      let url = '';

      if (window.electronAPI?.isElectron) {
        const buffer = await window.electronAPI.readFile(track.filePath);
        const type = getAudioMimeType(track.filePath);
        const blob = new Blob([buffer], { type });
        url = URL.createObjectURL(blob);
      } else if (track.fileBlob) {
        // Mobile / fallback blob
        url = URL.createObjectURL(track.fileBlob);
      } else {
        // Desktop handle resolution (with on-the-fly permissions recovery)
        let handle = track.fileHandle;
        if (!handle) {
          handle = await resolveFileHandle(track) || undefined;
          if (handle) {
            track.fileHandle = handle;
          }
        }

        if (handle) {
          const file = await handle.getFile();
          url = URL.createObjectURL(file);
        } else {
          throw new Error('Nenhuma fonte de arquivo disponível para reprodução');
        }
      }

      currentObjectUrlRef.current = url;
      audioRef.current.src = url;
      setCurrentTrack(track);
      
      await audioRef.current.play();
      recordFirstAudioMetric(playbackStartedAt);
      setIsPlaying(true);
    } catch (err) {
      console.error('Erro ao reproduzir faixa:', err);
      showAlert('Erro de Reprodução', 'Não foi possível ler o arquivo de áudio. Certifique-se de que a permissão da pasta está ativa.');
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (currentTrack) {
        audioRef.current.play().catch(console.error);
        setIsPlaying(true);
      } else if (tracks.length > 0) {
        playTrack(tracks[0]);
      }
    }
  };

  const playNext = () => {
    const { queue, queueIndex, repeatMode, isShuffle } = playbackStateRef.current;
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;

    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    }

    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        return; // Stop playback
      }
    }

    setQueueIndex(nextIndex);
    playTrack(queue[nextIndex], undefined, true);
  };

  const playPrev = () => {
    const { queue, queueIndex, repeatMode } = playbackStateRef.current;
    if (queue.length === 0) return;

    let prevIndex = queueIndex - 1;

    // If more than 3 seconds in, restart track instead of going previous
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    if (prevIndex < 0) {
      if (repeatMode === 'all') {
        prevIndex = queue.length - 1;
      } else {
        prevIndex = 0; // stay on first track
      }
    }

    setQueueIndex(prevIndex);
    playTrack(queue[prevIndex], undefined, true);
  };

  const seek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const changeVolume = (vol: number) => {
    const safeVol = Math.max(0, Math.min(1, vol));
    setVolume(safeVol);
    localStorage.setItem('spotify_local_volume', safeVol.toString());
    if (audioRef.current) {
      audioRef.current.volume = safeVol;
    }
  };

  const toggleShuffle = () => {
    setIsShuffle(!isShuffle);
  };

  const toggleRepeatMode = () => {
    setRepeatMode(prev => {
      if (prev === 'none') return 'all';
      if (prev === 'all') return 'one';
      return 'none';
    });
  };


  // Listen for playback events from Chromecast via Electron IPC
  useEffect(() => {
    if (!window.electronAPI?.isElectron) return;

    let cleanupChanged: (() => void) | undefined;
    let cleanupSkip: (() => void) | undefined;

    if (window.electronAPI.onCastPlaybackChanged) {
      cleanupChanged = window.electronAPI.onCastPlaybackChanged((data: { isPlaying: boolean; currentTime: number | null }) => {
        if (!isCasting) return;
        
        console.log('[MediaLibraryContext] Chromecast state sync:', data);
        
        // Sync play/pause state
        if (audioRef.current) {
          if (data.isPlaying && audioRef.current.paused) {
            audioRef.current.play().catch(console.error);
          } else if (!data.isPlaying && !audioRef.current.paused) {
            audioRef.current.pause();
          }
          
          // Sync current seek time if drift is significant (> 2.5 seconds)
          if (data.currentTime !== null) {
            const currentLocalTime = audioRef.current.currentTime;
            if (Math.abs(currentLocalTime - data.currentTime) > 2.5) {
              audioRef.current.currentTime = data.currentTime;
            }
          }
        }
      });
    }

    if (window.electronAPI.onCastSkipTrack) {
      cleanupSkip = window.electronAPI.onCastSkipTrack((direction: 'next' | 'prev') => {
        if (!isCasting) return;
        
        console.log('[MediaLibraryContext] Chromecast skipped track via TV Remote:', direction);
        if (direction === 'next') {
          playNext();
        } else if (direction === 'prev') {
          playPrev();
        }
      });
    }

    return () => {
      if (cleanupChanged) cleanupChanged();
      if (cleanupSkip) cleanupSkip();
    };
  }, [isCasting, playNext, playPrev]);

  const createPlaylist = async (name: string, trackIds: string[] = [], ytPlaylistId?: string, coverUrl?: string) => {
    const newPlaylist: Playlist = {
      id: `playlist_${Date.now()}`,
      name,
      trackIds,
      coverUrl,
      ytPlaylistId
    };
    const updated = [...playlists, newPlaylist];
    setPlaylists(updated);
    await savePlaylistsToCache(updated);
    return newPlaylist.id;
  };

  const deletePlaylist = async (playlistId: string) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;

    const updated = playlists.filter(p => p.id !== playlistId);
    setPlaylists(updated);
    await savePlaylistsToCache(updated);

    if (currentView === 'playlist' && viewParams.id === playlistId) {
      setView('home');
    }

    // Se estiver no Electron e houver músicas associadas à playlist
    if (window.electronAPI?.isElectron && playlist.trackIds && playlist.trackIds.length > 0) {
      // Encontrar as faixas reais pertencentes a esta playlist
      const playlistTracks = tracks.filter(t => playlist.trackIds.includes(t.id));
      const localTracks = playlistTracks.filter(t => t.filePath);

      if (localTracks.length > 0) {
        const shouldDeleteFiles = await showConfirm(
          'Excluir Arquivos de Músicas',
          `Deseja excluir também os arquivos físicos de música (.m4a e .lrc) desta playlist do seu disco rígido?\n\nEsta ação apagará permanentemente ${localTracks.length} arquivo(s) de áudio do seu computador.`
        );

        if (shouldDeleteFiles) {
          const tracksToDeleteIds = localTracks.map(t => t.id);

          for (const track of localTracks) {
            try {
              // Deleta arquivo de áudio principal
              if (window.electronAPI.deleteFile) {
                await window.electronAPI.deleteFile(track.filePath);
                
                // Deleta arquivo de letra sincronizada (.lrc) se houver
                if (track.hasLrcFile) {
                  const lrcPath = track.filePath.replace(/\.[^.]+$/, '.lrc');
                  await window.electronAPI.deleteFile(lrcPath);
                }
              }
              // Deleta o blob offline ( IndexedDB )
              await removeTrackOfflineBlob(track.id);
            } catch (err) {
              console.error(`Erro ao deletar arquivos físicos para a faixa ${track.title}:`, err);
            }
          }

          // Atualiza lista de faixas globais em memória e no cache SQLite
          const remainingTracks = tracks.filter(t => !tracksToDeleteIds.includes(t.id));
          setTracks(remainingTracks);
          await saveLibraryToCache(remainingTracks, folders);

          // Se a música atual em reprodução foi excluída, para a reprodução
          if (currentTrack && tracksToDeleteIds.includes(currentTrack.id)) {
            audioRef.current?.pause();
            setCurrentTrack(null);
            setIsPlaying(false);
          }

          // Remove as referências dessas músicas deletadas de outras playlists
          const cleanedPlaylists = updated.map(p => ({
            ...p,
            trackIds: p.trackIds.filter(id => !tracksToDeleteIds.includes(id))
          }));
          setPlaylists(cleanedPlaylists);
          await savePlaylistsToCache(cleanedPlaylists);

          // Remove do painel de fila de reprodução (queue)
          setQueue(prev => prev.filter(t => !tracksToDeleteIds.includes(t.id)));
        }
      }
    }
  };

  const deleteTrack = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // Check if the track belongs to any playlist
    const associatedPlaylists = playlists.filter(p => p.trackIds.includes(trackId));
    
    // If it belongs to any playlist, we alert/confirm using showConfirm
    if (associatedPlaylists.length > 0) {
      const playlistNames = associatedPlaylists.map(p => `"${p.name}"`).join(', ');
      const confirmed = await showConfirm(
        'Excluir Música',
        `Esta música pertence às seguintes playlists: ${playlistNames}.\n\nSe você excluí-la da biblioteca, ela também será removida dessas playlists. Deseja continuar?`
      );
      if (!confirmed) return;
    } else {
      // Just a simple confirmation to be safe
      const confirmed = await showConfirm(
        'Excluir Música',
        `Tem certeza que deseja excluir "${track.title}" da sua biblioteca?`
      );
      if (!confirmed) return;
    }

    try {
      // 1. Delete physical files if we are on Electron and it has a filePath
      if (window.electronAPI?.deleteFile && track.filePath) {
        try {
          await window.electronAPI.deleteFile(track.filePath);
          if (track.hasLrcFile) {
            const lrcPath = track.filePath.replace(/\.[^.]+$/, '.lrc');
            await window.electronAPI.deleteFile(lrcPath);
          }
        } catch (err) {
          console.error(`Erro ao deletar arquivos físicos para a faixa ${track.title}:`, err);
        }
      }
      
      // 2. Delete offline blob (from IndexedDB)
      await removeTrackOfflineBlob(track.id);
    } catch (err) {
      console.error('Erro ao remover arquivo/blob da música:', err);
    }

    // 3. Update global tracks list in state and SQLite cache
    const remainingTracks = tracks.filter(t => t.id !== trackId);
    setTracks(remainingTracks);
    await saveLibraryToCache(remainingTracks, folders);

    // 4. Update playlists (remove this trackId)
    const cleanedPlaylists = playlists.map(p => ({
      ...p,
      trackIds: p.trackIds.filter(id => id !== trackId)
    }));
    setPlaylists(cleanedPlaylists);
    await savePlaylistsToCache(cleanedPlaylists);

    // 5. Update queue
    setQueue(prev => prev.filter(t => t.id !== trackId));

    // 6. Stop playback if it's the current track
    if (currentTrack && currentTrack.id === trackId) {
      audioRef.current?.pause();
      setCurrentTrack(null);
      setIsPlaying(false);
    }

    await showAlert('Música Excluída', `A música "${track.title}" foi excluída com sucesso.`);
  };

  const deleteAlbum = async (albumName: string) => {
    const albumTracks = tracks.filter(t => t.album.toLowerCase() === albumName.toLowerCase());
    if (albumTracks.length === 0) return;

    // Check if any of these tracks belong to any playlist
    const associatedPlaylists: string[] = [];
    albumTracks.forEach(track => {
      playlists.forEach(p => {
        if (p.trackIds.includes(track.id) && !associatedPlaylists.includes(p.name)) {
          associatedPlaylists.push(p.name);
        }
      });
    });

    let confirmed = false;
    if (associatedPlaylists.length > 0) {
      const playlistNames = associatedPlaylists.map(name => `"${name}"`).join(', ');
      confirmed = await showConfirm(
        'Excluir Álbum',
        `Algumas músicas deste álbum pertencem às seguintes playlists: ${playlistNames}.\n\nSe você excluir o álbum da biblioteca, as músicas também serão excluídas dessas playlists. Deseja continuar?`
      );
    } else {
      confirmed = await showConfirm(
        'Excluir Álbum',
        `Tem certeza que deseja excluir o álbum "${albumTracks[0].album}" (${albumTracks.length} música(s)) da sua biblioteca?`
      );
    }

    if (!confirmed) return;

    const tracksToDeleteIds = albumTracks.map(t => t.id);

    try {
      // 1. Delete physical files if on Electron
      for (const track of albumTracks) {
        if (window.electronAPI?.deleteFile && track.filePath) {
          try {
            await window.electronAPI.deleteFile(track.filePath);
            if (track.hasLrcFile) {
              const lrcPath = track.filePath.replace(/\.[^.]+$/, '.lrc');
              await window.electronAPI.deleteFile(lrcPath);
            }
          } catch (err) {
            console.error(`Erro ao deletar arquivos físicos para a faixa ${track.title}:`, err);
          }
        }
        // 2. Delete offline blob (from IndexedDB)
        await removeTrackOfflineBlob(track.id);
      }
    } catch (err) {
      console.error('Erro ao remover arquivos/blobs do álbum:', err);
    }

    // 3. Update global tracks list in state and SQLite cache
    const remainingTracks = tracks.filter(t => !tracksToDeleteIds.includes(t.id));
    setTracks(remainingTracks);
    await saveLibraryToCache(remainingTracks, folders);

    // 4. Update playlists (remove tracks of this album)
    const cleanedPlaylists = playlists.map(p => ({
      ...p,
      trackIds: p.trackIds.filter(id => !tracksToDeleteIds.includes(id))
    }));
    setPlaylists(cleanedPlaylists);
    await savePlaylistsToCache(cleanedPlaylists);

    // 5. Update queue
    setQueue(prev => prev.filter(t => !tracksToDeleteIds.includes(t.id)));

    // 6. Stop playback if it's playing a track from this album
    if (currentTrack && tracksToDeleteIds.includes(currentTrack.id)) {
      audioRef.current?.pause();
      setCurrentTrack(null);
      setIsPlaying(false);
    }

    // 7. Go back or change view to home since the album is gone
    setView('home');

    await showAlert('Álbum Excluído', `O álbum "${albumTracks[0].album}" foi excluído com sucesso.`);
  };

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const updated = playlists.map(p => {
      if (p.id === playlistId) {
        if (!p.trackIds.includes(trackId)) {
          return { ...p, trackIds: [...p.trackIds, trackId] };
        }
      }
      return p;
    });
    setPlaylists(updated);
    await savePlaylistsToCache(updated);
  };

  const updatePlaylistTrackIds = async (playlistId: string, trackIds: string[]) => {
    const updated = playlists.map(p => {
      if (p.id === playlistId) {
        return { ...p, trackIds };
      }
      return p;
    });
    setPlaylists(updated);
    await savePlaylistsToCache(updated);
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    const updated = playlists.map(p => {
      if (p.id === playlistId) {
        return { ...p, trackIds: p.trackIds.filter(id => id !== trackId) };
      }
      return p;
    });
    setPlaylists(updated);
    await savePlaylistsToCache(updated);
  };

  const toggleTrackFavorite = async (trackId: string) => {
    try {
      const isFav = await toggleFavorite(trackId);
      if (isFav !== null) {
        setTracks(prevTracks => prevTracks.map(t => {
          if (t.id === trackId) {
            return { ...t, isFavorite: isFav };
          }
          return t;
        }));
      }
    } catch (err) {
      console.error('Failed to toggle favorite in context:', err);
    }
  };

  const updateTrackMetadata = async (trackId: string, metadata: Partial<Track>): Promise<boolean> => {
    try {
      const track = tracks.find(t => t.id === trackId);
      if (!track) return false;

      const updatedTrack = { ...track, ...metadata };
      const updatedTracks = tracks.map(t => (t.id === trackId ? updatedTrack : t));
      setTracks(updatedTracks);
      await saveLibraryToCache(updatedTracks, folders);
      await updateTrackMetadataInSQLite(trackId, {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        year: metadata.year ?? null,
        trackNumber: metadata.trackNumber ?? null,
        genre: metadata.genre ?? null,
        coverArt: metadata.coverArt ?? null
      });

      if (currentTrack?.id === trackId) {
        setCurrentTrack(updatedTrack);
      }
      return true;
    } catch (err) {
      console.error('Failed to update track metadata in context:', err);
      return false;
    }
  };

  const updatePlaylistMetadata = async (playlistId: string, metadata: Partial<Playlist>): Promise<boolean> => {
    try {
      const updated = playlists.map(p => (p.id === playlistId ? { ...p, ...metadata } : p));
      setPlaylists(updated);
      await savePlaylistsToCache(updated);
      await updatePlaylistMetadataInSQLite(playlistId, {
        name: metadata.name,
        coverUrl: metadata.coverUrl ?? null
      });
      return true;
    } catch (err) {
      console.error('Failed to update playlist metadata in context:', err);
      return false;
    }
  };

  const addToQueue = (track: Track) => {
    setQueue(prev => {
      const isAlreadyPlaying = prev.length > 0 && queueIndex >= 0;
      const updated = [...prev, track];
      if (!isAlreadyPlaying) {
        setTimeout(() => playTrack(track, updated), 0);
      }
      return updated;
    });
  };

  const addToQueueNext = (track: Track) => {
    setQueue(prev => {
      const updated = [...prev];
      const insertAt = queueIndex >= 0 ? queueIndex + 1 : 0;
      updated.splice(insertAt, 0, track);
      if (queueIndex === -1) {
        setTimeout(() => playTrack(track, updated), 0);
      }
      return updated;
    });
  };

  const removeFromQueue = (index: number) => {
    setQueue(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (index === queueIndex) {
        if (updated.length === 0) {
          audioRef.current?.pause();
          setCurrentTrack(null);
          setIsPlaying(false);
          setQueueIndex(-1);
        } else {
          const nextIdx = index >= updated.length ? 0 : index;
          setQueueIndex(nextIdx);
          setTimeout(() => playTrack(updated[nextIdx], updated), 0);
        }
      } else if (index < queueIndex) {
        setQueueIndex(prevIdx => prevIdx - 1);
      }
      return updated;
    });
  };

  const clearQueue = () => {
    if (currentTrack) {
      setQueue([currentTrack]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(-1);
    }
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    setQueue(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      
      if (queueIndex === fromIndex) {
        setQueueIndex(toIndex);
      } else if (queueIndex > fromIndex && queueIndex <= toIndex) {
        setQueueIndex(prevIdx => prevIdx - 1);
      } else if (queueIndex < fromIndex && queueIndex >= toIndex) {
        setQueueIndex(prevIdx => prevIdx + 1);
      }
      
      return updated;
    });
  };



  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && currentView === 'fullscreen') {
        goBack();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [currentView]);

  // Import folder via Directory Picker (Desktop)
  const scanLocalFolder = async () => {
    if (isScanningRef.current) {
      pendingFolderSelectionRef.current = true;
      void showAlert('Biblioteca em atualização', 'O seletor de pasta será aberto assim que a atualização atual terminar.');
      return;
    }
    const scanStartedAt = performance.now();

    // Android: use <input webkitdirectory> to pick a folder
    if (!isElectron() && /android/i.test(navigator.userAgent)) {
      try {
        setLibraryStatus({ phase: 'selecting' });
        const input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('accept', '.mp3,.m4a,.lrc');
        input.style.display = 'none';
        document.body.appendChild(input);

        const files = await new Promise<FileList | null>((resolve) => {
          input.onchange = () => resolve(input.files);
          input.click();
        });
        document.body.removeChild(input);

        if (!files || files.length === 0) {
          setLibraryStatus({ phase: 'idle' });
          return;
        }
        await importLocalFiles(files);
      } catch (err) {
        console.error('Erro ao importar pasta no Android:', err);
        setLibraryStatus({ phase: 'error', message: 'Não foi possível importar a pasta selecionada.' });
      }
      return;
    }

    isScanningRef.current = true;
    const scan = { cancelled: false, id: `library-add-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    activeScanRef.current = scan;

    if (window.electronAPI?.isElectron) {
      try {
        setLibraryStatus({ phase: 'selecting' });
        const folderPath = await window.electronAPI.selectFolder();
        if (!folderPath) {
          setLibraryStatus({ phase: 'idle' });
          isScanningRef.current = false;
          return; // Cancelled
        }

        const folderPathNormalized = folderPath.replace(/\\/g, '/');
        setLibraryStatus({ phase: 'scanning', folder: folderPathNormalized, processed: 0, total: 0 });

        const files = await window.electronAPI.readDirectory(folderPathNormalized, scan.id);
        const scannedTracks: Track[] = [];

        if (files.length === 0) {
          await showAlert(
            'Nenhum áudio compatível encontrado',
            'A pasta foi adicionada, mas não contém arquivos MP3, M4A, FLAC, OGG, WAV ou AAC.'
          );
        }

        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
          if (scan.cancelled) throw createScanCancelledError();
          const file = files[fileIndex];
          setLibraryStatus({ phase: 'scanning', folder: folderPathNormalized, processed: fileIndex, total: files.length });
          const existing = tracksRef.current.find(t => t.filePath === file.filePath);
          if (existing && existing.lastModified === file.lastModified) {
            scannedTracks.push(existing);
            setLibraryStatus({ phase: 'scanning', folder: folderPathNormalized, processed: fileIndex + 1, total: files.length });
            continue;
          }

          try {
            const buffer = await withOperationTimeout(window.electronAPI.readFile(file.filePath), 10000, 'FILE_READ_TIMEOUT');
            const blob = new Blob([buffer]);
            const metadata = await withOperationTimeout(mm.parseBlob(blob), 10000, 'METADATA_TIMEOUT');

            let coverArt: string | undefined;
            if (metadata.common.picture && metadata.common.picture.length > 0) {
              const pic = metadata.common.picture[0];
              const picBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
              coverArt = await blobToDataURL(picBlob);
            }

            const embeddedLyrics = extractEmbeddedLyrics(metadata);
            let lrcContent = embeddedLyrics;
            if (file.hasLrc) {
              const ext = file.filePath.substring(file.filePath.lastIndexOf('.'));
              const lrcPath = file.filePath.substring(0, file.filePath.length - ext.length) + '.lrc';
              const text = await withOperationTimeout(window.electronAPI.readTextFile(lrcPath), 5000, 'LYRICS_READ_TIMEOUT');
              if (text) lrcContent = text;
            }

            const genre = metadata.common.genre && metadata.common.genre.length > 0 
              ? metadata.common.genre[0] 
              : undefined;

            scannedTracks.push({
              id: file.filePath,
              title: metadata.common.title || file.fileName.replace(AUDIO_FILE_EXTENSION, ''),
              artist: metadata.common.artist || 'Artista Desconhecido',
              album: metadata.common.album || 'Álbum Desconhecido',
              duration: metadata.format.duration || 0,
              trackNumber: metadata.common.track.no || undefined,
              year: metadata.common.year || undefined,
              coverArt,
              embeddedLyrics,
              fileName: file.fileName,
              filePath: file.filePath,
              lastModified: file.lastModified,
              hasLrcFile: file.hasLrc,
              lrcContent,
              genre,
              playCount: existing ? (existing.playCount || 0) : 0,
              lastPlayed: existing ? (existing.lastPlayed || 0) : 0,
              isFavorite: existing ? !!existing.isFavorite : false
            });
          } catch (metaErr) {
            console.error('Failed to parse metadata:', file.filePath, metaErr);
            scannedTracks.push({
              id: file.filePath,
              title: file.fileName.replace(AUDIO_FILE_EXTENSION, ''),
              artist: 'Artista Desconhecido',
              album: 'Álbum Desconhecido',
              duration: 0,
              fileName: file.fileName,
              filePath: file.filePath,
              lastModified: file.lastModified,
              hasLrcFile: file.hasLrc,
              playCount: existing ? (existing.playCount || 0) : 0,
              lastPlayed: existing ? (existing.lastPlayed || 0) : 0,
              isFavorite: existing ? !!existing.isFavorite : false
            });
          }
          setLibraryStatus({ phase: 'scanning', folder: folderPathNormalized, processed: fileIndex + 1, total: files.length });
        }

        if (scan.cancelled) throw createScanCancelledError();
        // Filter out existing tracks belonging to the same folder path to avoid duplicates
        const otherTracks = tracksRef.current.filter(t => !isTrackInFolder(t.filePath, folderPathNormalized));
        const newTracksList = [...otherTracks, ...scannedTracks];

        const newFoldersList = folders.includes(folderPathNormalized) 
          ? folders 
          : [...folders, folderPathNormalized];

        setTracks(newTracksList);
        setFolders(newFoldersList);

        await saveLibraryToCache(newTracksList, newFoldersList);
      } catch (err) {
        if (isScanCancelledError(err)) {
          setLibraryStatus({ phase: 'idle' });
        } else {
          console.error('Erro ao ler diretório nativo:', err);
          setLibraryStatus({ phase: 'error', message: 'Não foi possível adicionar a pasta selecionada.' });
        }
      } finally {
        recordPerformanceMetric('library-indexation', performance.now() - scanStartedAt, {
          source: 'add-electron',
          trackCount: tracksRef.current.length,
          cancelled: scan.cancelled,
        });
        setLibraryStatus(previous => previous.phase === 'error' ? previous : { phase: 'idle' });
        if (activeScanRef.current === scan) activeScanRef.current = null;
        isScanningRef.current = false;
        if (pendingFolderSelectionRef.current) {
          pendingFolderSelectionRef.current = false;
          setTimeout(() => { void scanLocalFolder(); }, 0);
        }
      }
      return;
    }

    try {
      if (!(window as any).showDirectoryPicker) {
        showAlert('API não suportada', 'Seu navegador não suporta o File System Access API diretamente. Use a opção de importar arquivos.');
        isScanningRef.current = false;
        return;
      }

      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });

      setLibraryStatus({ phase: 'scanning', folder: dirHandle.name, processed: 0, total: 0 });
      await saveDirectoryHandle(dirHandle);

      // Perform scan
      const existingMap = new Map(tracksRef.current.map(t => [t.filePath, t]));
      const { tracks: scanned } = await scanDirectoryHandle(
        dirHandle,
        existingMap,
        (processed, total) => setLibraryStatus({ phase: 'scanning', folder: dirHandle.name, processed, total }),
        () => scan.cancelled
      );

      if (scan.cancelled) throw createScanCancelledError();
      // Filter out existing tracks belonging to the same folder path to avoid duplicates
      const otherTracks = tracksRef.current.filter(t => !isTrackInFolder(t.filePath, dirHandle.name));
      const newTracksList = [...otherTracks, ...scanned];

      const newFoldersList = folders.includes(dirHandle.name) 
        ? folders 
        : [...folders, dirHandle.name];

      setTracks(newTracksList);
      setFolders(newFoldersList);

      await saveLibraryToCache(newTracksList, newFoldersList);
    } catch (err) {
      if (!isScanCancelledError(err)) {
        console.error('Erro ao ler diretório:', err);
        setLibraryStatus({ phase: 'error', message: 'Não foi possível adicionar a pasta selecionada.' });
      }
    } finally {
      recordPerformanceMetric('library-indexation', performance.now() - scanStartedAt, {
        source: 'add-browser',
        trackCount: tracksRef.current.length,
        cancelled: scan.cancelled,
      });
      setLibraryStatus(previous => previous.phase === 'error' ? previous : { phase: 'idle' });
      if (activeScanRef.current === scan) activeScanRef.current = null;
      isScanningRef.current = false;
    }
  };

  const reauthorizeLibraryFolder = async (folder?: string) => {
    const targetFolder = folder || (libraryStatus.phase === 'permission-required' ? libraryStatus.folder : '');
    if (!targetFolder || !window.electronAPI?.authorizeFolder) return false;
    setLibraryStatus({ phase: 'selecting' });
    try {
      const authorized = await window.electronAPI.authorizeFolder(targetFolder);
      if (!authorized) {
        setLibraryStatus({ phase: 'permission-required', folder: targetFolder });
        return false;
      }
      await checkPermissionsAndReload(tracksRef.current);
      return true;
    } catch (error) {
      console.error('Failed to reauthorize library folder:', error);
      setLibraryStatus({ phase: 'permission-required', folder: targetFolder });
      void showAlert('Permissão necessária', 'Selecione exatamente a pasta indicada para restaurar o acesso.');
      return false;
    }
  };

  // Import folder via webkitdirectory (Mobile Fallback)
  const importLocalFiles = async (files: FileList | File[], shouldSaveOffline: boolean = false) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    const scan = { cancelled: false };
    const scanStartedAt = performance.now();
    activeScanRef.current = scan;
    setLibraryStatus({ phase: 'scanning', folder: 'Importação local', processed: 0, total: 0 });
    try {
      const existingMap = new Map(tracksRef.current.map(t => [t.filePath, t]));
      const scanned = await scanFileList(
        files,
        existingMap,
        shouldSaveOffline,
        (processed, total) => setLibraryStatus({ phase: 'scanning', folder: 'Importação local', processed, total }),
        () => scan.cancelled
      );

      // Extract a simulated folder name from the paths
      let simulatedFolder = 'Importado';
      if (files instanceof FileList && files.length > 0 && files[0].webkitRelativePath) {
        simulatedFolder = files[0].webkitRelativePath.split('/')[0];
      }

      if (scan.cancelled) throw createScanCancelledError();
      const otherTracks = tracksRef.current.filter(t => !isTrackInFolder(t.filePath, simulatedFolder));
      const newTracksList = [...otherTracks, ...scanned];

      const newFoldersList = folders.includes(simulatedFolder) 
        ? folders 
        : [...folders, simulatedFolder];

      setTracks(newTracksList);
      setFolders(newFoldersList);

      await saveLibraryToCache(newTracksList, newFoldersList);
    } catch (err) {
      if (!isScanCancelledError(err)) {
        console.error('Erro ao importar arquivos:', err);
        setLibraryStatus({ phase: 'error', message: 'Não foi possível importar os arquivos selecionados.' });
      }
    } finally {
      recordPerformanceMetric('library-indexation', performance.now() - scanStartedAt, {
        source: 'import-files',
        trackCount: tracksRef.current.length,
        cancelled: scan.cancelled,
      });
      setLibraryStatus(previous => previous.phase === 'error' ? previous : { phase: 'idle' });
      if (activeScanRef.current === scan) activeScanRef.current = null;
      isScanningRef.current = false;
    }
  };

  const deleteFolder = async (folderName: string) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsLoading(true);
    try {
      const remainingTracks = await removeDirectoryHandle(folderName, tracksRef.current);
      setTracks(remainingTracks);
      setFolders(folders.filter(f => f !== folderName));
      
      // If playing track is deleted, stop playback
      if (currentTrack && isTrackInFolder(currentTrack.filePath, folderName)) {
        audioRef.current?.pause();
        setCurrentTrack(null);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Erro ao remover pasta:', err);
    } finally {
      setIsLoading(false);
      isScanningRef.current = false;
    }
  };

  const downloadQueueRef = useRef<QueuedDownload[]>([]);
  const isProcessingBatchRef = useRef(false);
  
  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);

  // Auto-close download notification when all downloads are finished
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (downloadQueue.length === 0) return;
    const allDone = downloadQueue.every(item => item.status === 'completed' || item.status === 'error');
    if (allDone) {
      // Auto-dismiss after 5 seconds
      autoDismissTimerRef.current = setTimeout(() => {
        setDownloadQueue([]);
      }, 5000);
    } else {
      // Cancel any pending auto-dismiss if new items arrive
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
    }
    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, [downloadQueue]);

  const runConcurrent = async (tasks: (() => Promise<any>)[], maxConcurrency: number) => {
    let index = 0;
    const workers = Array(Math.min(tasks.length, maxConcurrency)).fill(null).map(async () => {
      while (index < tasks.length) {
        const currentIdx = index++;
        try {
          await tasks[currentIdx]();
        } catch (err) {
          console.error(`Concurrent task ${currentIdx} failed:`, err);
        }
      }
    });
    await Promise.all(workers);
  };

  const runBatchPipeline = async (batchItems: QueuedDownload[]) => {
    const downloadDir = folders[0] || '';
    if (!downloadDir || downloadDir.trim() === '') {
      showAlert(
        'Pasta de Biblioteca Não Configurada', 
        'Por favor, vá em Configurações e adicione uma Pasta da Biblioteca antes de iniciar.'
      );
      setDownloadQueue(prev => prev.map(q => 
        batchItems.some(bi => bi.videoId === q.videoId) ? { ...q, status: 'error' as const } : q
      ));
      return;
    }

    // 1. RESOLVE STAGE (Concurrency = 2)
    const resolvedIdsMap = new Map<string, string>();
    const resolvedCoversMap = new Map<string, string>();
    const resolvedAlbumsMap = new Map<string, string>();
    const resolveTasks = batchItems.map(item => async () => {
      setDownloadQueue(prev => prev.map(q => q.videoId === item.videoId ? { ...q, status: 'resolving' } : q));
      
      // Delay resolve to avoid spamming the search api
      const delayMs = 500 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      try {
        const resolveResult = await window.electronAPI!.ytResolveId({
          id: item.videoId,
          title: item.name,
          artist: item.artist
        });

        let resolvedId: string;
        let resolvedCoverUrl: string | undefined;

        if (typeof resolveResult === 'string') {
          resolvedId = resolveResult;
        } else {
          resolvedId = resolveResult.videoId;
          resolvedCoverUrl = resolveResult.coverUrl;
        }

        resolvedIdsMap.set(item.videoId, resolvedId);
        if (resolvedCoverUrl) {
          resolvedCoversMap.set(item.videoId, resolvedCoverUrl);
        }
        if (typeof resolveResult !== 'string' && resolveResult.albumName) {
          resolvedAlbumsMap.set(item.videoId, resolveResult.albumName);
        }
      } catch (err) {
        console.error(`Failed to resolve ID for ${item.name}:`, err);
        setDownloadQueue(prev => prev.map(q => q.videoId === item.videoId ? { ...q, status: 'error' } : q));
      }
    });
    
    await runConcurrent(resolveTasks, 4);

    // 2. DOWNLOAD STAGE (Concurrency = 4)
    const tempAudioMap = new Map<string, string>();
    const tempCoverMap = new Map<string, string>();
    const downloadTasks = batchItems
      .filter(item => resolvedIdsMap.has(item.videoId))
      .map(item => async () => {
        const videoId = resolvedIdsMap.get(item.videoId)!;
        setDownloadQueue(prev => prev.map(q => q.videoId === item.videoId ? { ...q, status: 'downloading' } : q));
        
        // Stagger requests: delay start of task to avoid rate limits
        const delayMs = 1500 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        const coverUrlToUse = resolvedCoversMap.get(item.videoId) || item.coverUrl;

        try {
          const [tempAudioPath, tempCoverPath] = await Promise.all([
            window.electronAPI!.ytDownloadTempAudio({ videoId }),
            window.electronAPI!.ytDownloadTempCover({ videoId, coverUrl: coverUrlToUse })
          ]);
          
          if (tempAudioPath) {
            tempAudioMap.set(item.videoId, tempAudioPath);
          }
          if (tempCoverPath) {
            tempCoverMap.set(item.videoId, tempCoverPath);
          }
        } catch (err) {
          console.error(`Failed to download temp files for ${item.name}:`, err);
          setDownloadQueue(prev => prev.map(q => q.videoId === item.videoId ? { ...q, status: 'error' } : q));
        }
      });
      
    await runConcurrent(downloadTasks, 4);

    // 3. PACKAGING STAGE (Concurrency = 5)
    const packagedTracks: Track[] = [];
    const packageTasks = batchItems
      .filter(item => tempAudioMap.has(item.videoId))
      .map(item => async () => {
        const videoId = resolvedIdsMap.get(item.videoId)!;
        const tempAudioPath = tempAudioMap.get(item.videoId)!;
        const tempCoverPath = tempCoverMap.get(item.videoId) || '';
        
        setDownloadQueue(prev => prev.map(q => q.videoId === item.videoId ? { ...q, status: 'packaging' } : q));
        
        try {
          const resolvedAlbum = resolvedAlbumsMap.get(item.videoId) || item.album;
          const finalFilePath = await window.electronAPI!.ytPackageAudio({
            tempAudioPath,
            tempCoverPath,
            title: item.name,
            artist: item.artist,
            album: resolvedAlbum,
            genre: item.genre || '',
            year: item.year || null,
            downloadDir,
            videoId
          });

          const lyricsRes = await window.electronAPI!.ytFetchSaveLyrics({
            title: item.name,
            artist: item.artist,
            album: resolvedAlbum,
            duration: item.duration,
            finalFilePath,
            videoId
          });
          
          await window.electronAPI!.ytCleanupTempFiles({ tempAudioPath, tempCoverPath });
          
          const normalizedFilePath = finalFilePath.replace(/\\/g, '/');
          const fileName = normalizedFilePath.substring(normalizedFilePath.lastIndexOf('/') + 1);
          const cleanedTitleFromFilename = fileName
            .replace(/\.[^/.]+$/, "") // remove extension
            .replace(new RegExp(`\\s*\\[${videoId}\\]$`), ""); // remove [videoId]

          const newTrack: Track = {
            id: normalizedFilePath,
            title: cleanedTitleFromFilename,
            artist: item.artist,
            album: resolvedAlbum,
            duration: item.duration || 0,
            coverArt: resolvedCoversMap.get(item.videoId) || item.coverUrl || undefined,
            fileName,
            filePath: normalizedFilePath,
            lastModified: Date.now(),
            hasLrcFile: !!lyricsRes.hasLrc,
            lrcContent: lyricsRes.lrcContent || undefined,
            genre: item.genre || undefined,
            year: item.year || undefined,
            playCount: 0,
            lastPlayed: 0,
            isFavorite: false
          };
          
          packagedTracks.push(newTrack);
          
          setTracks(prev => {
            const filtered = prev.filter(t => t.filePath !== normalizedFilePath);
            return [...filtered, newTrack];
          });

          setDownloadQueue(prev => prev.map(q => q.videoId === item.videoId ? { ...q, status: 'completed' } : q));
        } catch (err) {
          console.error(`Failed to package ${item.name}:`, err);
          setDownloadQueue(prev => prev.map(q => q.videoId === item.videoId ? { ...q, status: 'error' } : q));
          await window.electronAPI!.ytCleanupTempFiles({ tempAudioPath, tempCoverPath }).catch(() => {});
        }
      });
      
    await runConcurrent(packageTasks, 5);

    if (packagedTracks.length > 0) {
      setTracks(currentTracks => {
        saveLibraryToCache(currentTracks, folders).catch(err => {
          console.error('Failed to save library cache after batch download:', err);
        });
        return currentTracks;
      });
    }

    await checkPermissionsAndReload().catch(err => {
      console.error('Failed to run final library reload scan:', err);
    });
  };

  const processDownloadQueue = async () => {
    if (isProcessingBatchRef.current) return;

    const queue = downloadQueueRef.current;
    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    isProcessingBatchRef.current = true;

    try {
      await runBatchPipeline(pendingItems);
    } catch (err) {
      console.error('Batch download pipeline error:', err);
    } finally {
      isProcessingBatchRef.current = false;
      // Schedule check for newly added items
      setTimeout(() => {
        processDownloadQueue();
      }, 500);
    }
  };

  const addTracksToDownloadQueue = (tracksToAdd: {
    videoId: string;
    name: string;
    artist: string;
    album: string;
    coverUrl: string;
    duration: number | null;
    genre?: string;
    year?: number | null;
  }[]) => {
    if (!isOnlineCapable()) {
      showAlert('Indisponível', 'Downloads estão disponíveis apenas na versão desktop.');
      return;
    }
    const downloadDir = folders[0] || '';
    if (!downloadDir || downloadDir.trim() === '') {
      showAlert(
        'Pasta de Biblioteca Necessária', 
        'Por favor, vá em Configurações e adicione pelo menos uma Pasta da Biblioteca (onde os downloads serão salvos).'
      );
      return;
    }

    // Ensure download directory is registered as a library folder so it gets scanned
    if (window.electronAPI?.isElectron && downloadDir) {
      const normalizedDir = downloadDir.replace(/\\/g, '/');
      const alreadyAdded = folders.some(f => f.replace(/\\/g, '/').toLowerCase() === normalizedDir.toLowerCase());
      if (!alreadyAdded) {
        const updatedFolders = [...folders, downloadDir];
        setFolders(updatedFolders);
        set('spotify_local_folders', updatedFolders).then(() => {
          saveLibraryToCache(tracksRef.current, updatedFolders);
        });
      }
    }

    // Extract videoIds that are already downloaded locally
    const existingLocalVideoIds = new Set(
      tracksRef.current.map(t => getYouTubeIdFromTrack(t)).filter((id): id is string => id !== null)
    );

    const newItems = tracksToAdd.map(track => ({
      ...track,
      status: 'pending' as const
    })).filter(track => {
      const inQueue = downloadQueueRef.current.some(q => q.videoId === track.videoId);
      const isDownloaded = existingLocalVideoIds.has(track.videoId);
      return !inQueue && !isDownloaded;
    });

    if (newItems.length === 0) {
      showAlert('Fila de Download', 'Todas as músicas já estão na fila de download ou na sua biblioteca local.');
      return;
    }

    setDownloadQueue(prev => [...prev, ...newItems]);
    
    // Start processing queue (schedule in next tick to let state update)
    setTimeout(() => {
      processDownloadQueue();
    }, 100);
  };

  const clearDownloadQueue = () => {
    // Only keep items that are currently downloading or pending, clear completed/error
    setDownloadQueue(prev => prev.filter(item => item.status === 'downloading' || item.status === 'pending'));
  };

  const triggerNativeAirPlay = () => {
    if (audioRef.current && typeof (audioRef.current as any).webkitShowPlaybackTargetPicker === 'function') {
      (audioRef.current as any).webkitShowPlaybackTargetPicker();
    } else {
      console.warn("webkitShowPlaybackTargetPicker is not supported on this browser/environment.");
    }
  };

  return (
    <MediaLibraryContext.Provider value={{
      tracks,
      folders,
      playlists,
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      volume,
      queue,
      queueIndex,
      isShuffle,
      repeatMode,
      currentView,
      viewParams,
      lyrics,
      isLoading,
      libraryStatus,
      
      isMiniPlayer,
      enterMiniPlayer,
      exitMiniPlayer,
      
      playTrack,
      togglePlay,
      playNext,
      playPrev,
      seek,
      changeVolume,
      toggleShuffle,
      toggleRepeatMode,
      setView,
      triggerNativeAirPlay,
      
      scanLocalFolder,
      importLocalFiles,
      deleteFolder,
      checkPermissionsAndReload,
      reauthorizeLibraryFolder,
      cancelLibraryScan,
      setTracks,
      createPlaylist,
      deletePlaylist,
      deleteTrack,
      deleteAlbum,
      addTrackToPlaylist,
      updatePlaylistTrackIds,
      removeTrackFromPlaylist,
      updateTrackMetadata,
      updatePlaylistMetadata,
      addToQueue,
      addToQueueNext,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      goBack,
      showAlert,
      showConfirm,
      showPrompt,
      toggleTrackFavorite,
      isCasting,
      setIsCasting,

      downloadQueue,
      addTracksToDownloadQueue,
      clearDownloadQueue,

      ytSearchQuery,
      setYtSearchQuery,
      ytSearchMode,
      setYtSearchMode,
      ytSearchResults,
      setYtSearchResults,
      ytSearchCategory,
      setYtSearchCategory
    }}>
      {children}
      {modalConfig && (
        <div className="system-modal-overlay" onClick={() => {
          if (modalConfig.type === 'alert') {
            modalConfig.resolve(undefined);
          } else if (modalConfig.type === 'confirm') {
            modalConfig.resolve(false);
          } else {
            modalConfig.resolve(null);
          }
          setModalConfig(null);
        }}>
          <div className="system-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="system-modal-title">{modalConfig.title}</div>
            <div className="system-modal-message">{modalConfig.message}</div>
            
            {modalConfig.type === 'prompt' && (
              <input 
                type="text" 
                className="system-modal-input" 
                value={promptInputValue} 
                onChange={(e) => setPromptInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    modalConfig.resolve(promptInputValue);
                    setModalConfig(null);
                  } else if (e.key === 'Escape') {
                    modalConfig.resolve(null);
                    setModalConfig(null);
                  }
                }}
                autoFocus
              />
            )}
            
            <div className="system-modal-actions">
              {modalConfig.type !== 'alert' && (
                <button 
                  className="system-modal-btn secondary"
                  onClick={() => {
                    if (modalConfig.type === 'confirm') {
                      modalConfig.resolve(false);
                    } else {
                      modalConfig.resolve(null);
                    }
                    setModalConfig(null);
                  }}
                >
                  Cancelar
                </button>
              )}
              <button 
                className="system-modal-btn primary"
                onClick={() => {
                  if (modalConfig.type === 'alert') {
                    modalConfig.resolve(undefined);
                  } else if (modalConfig.type === 'confirm') {
                    modalConfig.resolve(true);
                  } else {
                    modalConfig.resolve(promptInputValue);
                  }
                  setModalConfig(null);
                }}
              >
                {modalConfig.type === 'alert' ? 'OK' : modalConfig.type === 'confirm' ? 'Confirmar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MediaLibraryContext.Provider>
  );
};
