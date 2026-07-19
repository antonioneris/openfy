import * as mm from 'music-metadata-browser';
import { get, set, del } from 'idb-keyval';
import { 
  getDatabase, 
  loadTracksFromSQLite, 
  saveTracksToSQLite, 
  loadPlaylistsFromSQLite, 
  savePlaylistsToSQLite, 
  exportSQLiteDatabase,
  incrementPlayCountInSQLite,
  toggleFavoriteInSQLite,
  isTrackInFolder,
  deduplicateTracks
} from './sqliteDatabase';

export { isTrackInFolder, deduplicateTracks };

export type ScanProgressCallback = (processed: number, total: number) => void;
export interface FileManifestEntry { filePath: string; lastModified: number }

export function isFolderManifestUnchanged(files: FileManifestEntry[], cachedTracks: Track[]): boolean {
  if (files.length !== cachedTracks.length) return false;
  const cachedByPath = new Map(cachedTracks.map(track => [track.filePath, track.lastModified]));
  return files.every(file => cachedByPath.get(file.filePath) === file.lastModified);
}

export function createScanCancelledError(): Error {
  const error = new Error('Library scan cancelled');
  error.name = 'AbortError';
  return error;
}

export function isScanCancelledError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.includes('SCAN_CANCELLED'));
}

export function withOperationTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function throwIfScanCancelled(shouldCancel?: () => boolean) {
  if (shouldCancel?.()) throw createScanCancelledError();
}


import type { Track, Playlist, LibraryState } from '../shared/types';
export type { Track, Playlist, LibraryState };

/**
 * Helper to extract YouTube video ID from a track if it was downloaded via the app
 */
export function getYouTubeIdFromTrack(track: Track): string | null {
  const source = track.fileName || track.filePath || track.id || '';
  if (!source) return null;
  // Match bracketed 11-character YouTube video ID
  const match = source.match(/\[([a-zA-Z0-9_-]{11})\]/);
  return match ? match[1] : null;
}

const DIRECTORY_HANDLE_KEY = 'spotify_local_dir_handles';
const OFFLINE_BLOBS_PREFIX = 'spotify_local_blob_';

/**
 * Converts a Blob to a Data URL (Base64) using FileReader.
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to extract embedded lyrics from music-metadata output.
 */
export function extractEmbeddedLyrics(metadata: mm.IAudioMetadata): string | undefined {
  // 1. Check common fields
  if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
    return typeof metadata.common.lyrics[0] === 'string'
      ? metadata.common.lyrics[0]
      : (metadata.common.lyrics[0] as any).text;
  }

  // 2. Check native frames (ID3v2)
  const nativeTags = metadata.native;
  if (nativeTags) {
    for (const type of Object.keys(nativeTags)) {
      const frames = nativeTags[type];
      if (Array.isArray(frames)) {
        // Find USLT frame
        const usltFrame = frames.find((f: any) => f.id === 'USLT' || f.key === 'USLT');
        if (usltFrame && usltFrame.value) {
          return typeof usltFrame.value === 'string'
            ? usltFrame.value
            : usltFrame.value.text || usltFrame.value.lyrics;
        }
      }
    }
  }

  return undefined;
}

/**
 * Scans a DirectoryEntry recursively (using standard showDirectoryPicker handles).
 */
export async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  existingTracksMap: Map<string, Track> = new Map(),
  onProgress?: ScanProgressCallback,
  shouldCancel?: () => boolean
): Promise<{ tracks: Track[]; filesScannedCount: number }> {
  const audioEntries: { handle: FileSystemFileHandle; path: string }[] = [];
  const lrcEntries: Map<string, FileSystemFileHandle> = new Map();

  // Helper for recursive traversal
  async function traverse(handle: FileSystemDirectoryHandle, currentPath: string = '') {
    for await (const entry of handle.values()) {
      throwIfScanCancelled(shouldCancel);
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const nameLower = entry.name.toLowerCase();
        if (nameLower.endsWith('.mp3') || nameLower.endsWith('.m4a')) {
          audioEntries.push({ handle: entry as FileSystemFileHandle, path: entryPath });
        } else if (nameLower.endsWith('.lrc')) {
          const key = entryPath.toLowerCase().replace(/\.lrc$/, '');
          lrcEntries.set(key, entry as FileSystemFileHandle);
        }
      } else if (entry.kind === 'directory') {
        await traverse(entry as FileSystemDirectoryHandle, entryPath);
      }
    }
  }

  await traverse(dirHandle);

  const scannedTracks: Track[] = [];
  let filesScannedCount = 0;

  for (const entry of audioEntries) {
    throwIfScanCancelled(shouldCancel);
    filesScannedCount++;
    const file = await withOperationTimeout(entry.handle.getFile(), 10000, 'FILE_READ_TIMEOUT');
    const relativePathKey = entry.path.toLowerCase().replace(/\.(mp3|m4a)$/, '');
    const fullPath = `${dirHandle.name}/${entry.path}`;

    // Check if we have an LRC file for this track
    const lrcHandle = lrcEntries.get(relativePathKey);
    let lrcContent: string | undefined;
    if (lrcHandle) {
      const lrcFile = await lrcHandle.getFile();
      lrcContent = await lrcFile.text();
    }

    // Check if track is cached and unmodified
    const existing = existingTracksMap.get(fullPath);
    if (existing && existing.lastModified === file.lastModified) {
      // Use cached metadata, just update temporary properties
      scannedTracks.push({
        ...existing,
        id: fullPath,
        filePath: fullPath,
        hasLrcFile: !!lrcHandle,
        lrcContent: lrcContent || existing.embeddedLyrics,
        fileHandle: entry.handle,
      });
      onProgress?.(filesScannedCount, audioEntries.length);
      continue;
    }

    // Read ID3 metadata
    try {
      const metadata = await withOperationTimeout(mm.parseBlob(file), 10000, 'METADATA_TIMEOUT');
      let coverArt: string | undefined;

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0];
        const picBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
        coverArt = await blobToDataURL(picBlob);
      }

      const embeddedLyrics = extractEmbeddedLyrics(metadata);
      const genre = metadata.common.genre && metadata.common.genre.length > 0 
        ? metadata.common.genre[0] 
        : undefined;

      const track: Track = {
        id: fullPath,
        title: metadata.common.title || entry.handle.name.replace(/\.(mp3|m4a)$/i, ''),
        artist: metadata.common.artist || 'Artista Desconhecido',
        album: metadata.common.album || 'Álbum Desconhecido',
        duration: metadata.format.duration || 0,
        trackNumber: metadata.common.track.no || undefined,
        year: metadata.common.year || undefined,
        coverArt,
        embeddedLyrics,
        fileName: entry.handle.name,
        filePath: fullPath,
        lastModified: file.lastModified,
        hasLrcFile: !!lrcHandle,
        lrcContent: lrcContent || embeddedLyrics,
        fileHandle: entry.handle,
        genre: genre || undefined,
        playCount: 0,
        lastPlayed: 0,
        isFavorite: false
      };

      scannedTracks.push(track);
    } catch (err) {
      console.error(`Erro ao ler metadados do arquivo ${entry.path}:`, err);
      // Fallback track object if parsing fails
      scannedTracks.push({
        id: fullPath,
        title: entry.handle.name.replace(/\.(mp3|m4a)$/i, ''),
        artist: 'Artista Desconhecido',
        album: 'Álbum Desconhecido',
        duration: 0,
        fileName: entry.handle.name,
        filePath: fullPath,
        lastModified: file.lastModified,
        hasLrcFile: !!lrcHandle,
        lrcContent,
        fileHandle: entry.handle,
      });
    }
    onProgress?.(filesScannedCount, audioEntries.length);
  }

  return { tracks: scannedTracks, filesScannedCount };
}

/**
 * Scans a flat list of File objects (e.g. from webkitdirectory file input on Android).
 */
export async function scanFileList(
  files: FileList | File[],
  existingTracksMap: Map<string, Track> = new Map(),
  shouldPersistBlobs: boolean = false,
  onProgress?: ScanProgressCallback,
  shouldCancel?: () => boolean
): Promise<Track[]> {
  const fileArray = Array.from(files);
  const audioFiles: File[] = [];
  const lrcFiles: Map<string, File> = new Map();

  for (const file of fileArray) {
    const path = file.webkitRelativePath || file.name;
    const nameLower = file.name.toLowerCase();
    if (nameLower.endsWith('.mp3') || nameLower.endsWith('.m4a')) {
      audioFiles.push(file);
    } else if (nameLower.endsWith('.lrc')) {
      const key = path.toLowerCase().replace(/\.lrc$/, '');
      lrcFiles.set(key, file);
    }
  }

  const scannedTracks: Track[] = [];

  for (let index = 0; index < audioFiles.length; index++) {
    throwIfScanCancelled(shouldCancel);
    const file = audioFiles[index];
    const path = file.webkitRelativePath || file.name;
    const relativePathKey = path.toLowerCase().replace(/\.(mp3|m4a)$/, '');

    // Match LRC
    const lrcFile = lrcFiles.get(relativePathKey);
    let lrcContent: string | undefined;
    if (lrcFile) {
      lrcContent = await lrcFile.text();
    }

    const existing = existingTracksMap.get(path);
    if (existing && existing.lastModified === file.lastModified) {
      // Re-use cache
      scannedTracks.push({
        ...existing,
        hasLrcFile: !!lrcFile,
        lrcContent: lrcContent || existing.embeddedLyrics,
        fileBlob: file,
      });
      // Optionally save file blob again if checked
      if (shouldPersistBlobs) {
        await set(`${OFFLINE_BLOBS_PREFIX}${existing.id}`, file);
      }
      onProgress?.(index + 1, audioFiles.length);
      continue;
    }

    try {
      const metadata = await withOperationTimeout(mm.parseBlob(file), 10000, 'METADATA_TIMEOUT');
      let coverArt: string | undefined;

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0];
        const picBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
        coverArt = await blobToDataURL(picBlob);
      }

      const embeddedLyrics = extractEmbeddedLyrics(metadata);
      const genre = metadata.common.genre && metadata.common.genre.length > 0 
        ? metadata.common.genre[0] 
        : undefined;

      const track: Track = {
        id: path,
        title: metadata.common.title || file.name.replace(/\.(mp3|m4a)$/i, ''),
        artist: metadata.common.artist || 'Artista Desconhecido',
        album: metadata.common.album || 'Álbum Desconhecido',
        duration: metadata.format.duration || 0,
        trackNumber: metadata.common.track.no || undefined,
        year: metadata.common.year || undefined,
        coverArt,
        embeddedLyrics,
        fileName: file.name,
        filePath: path,
        lastModified: file.lastModified,
        hasLrcFile: !!lrcFile,
        lrcContent: lrcContent || embeddedLyrics,
        fileBlob: file,
        genre: genre || undefined,
        playCount: 0,
        lastPlayed: 0,
        isFavorite: false
      };

      scannedTracks.push(track);

      // Save blob offline if requested
      if (shouldPersistBlobs) {
        await set(`${OFFLINE_BLOBS_PREFIX}${track.id}`, file);
      }
    } catch (err) {
      console.error(`Erro ao processar arquivo:`, err);
      scannedTracks.push({
        id: path,
        title: file.name.replace(/\.(mp3|m4a)$/i, ''),
        artist: 'Artista Desconhecido',
        album: 'Álbum Desconhecido',
        duration: 0,
        fileName: file.name,
        filePath: path,
        lastModified: file.lastModified,
        hasLrcFile: !!lrcFile,
        lrcContent,
        fileBlob: file,
      });
    }
    onProgress?.(index + 1, audioFiles.length);
  }

  return scannedTracks;
}

/**
 * Persists the current SQLite database binary to disk (Electron) or IndexedDB (Browser/Capacitor)
 */
async function persistSQLiteDB() {
  try {
    const binary = await exportSQLiteDatabase();
    if (!binary) return;
    if (window.electronAPI?.isElectron) {
      // Slice the buffer to get only the exported database bytes instead of the entire WASM heap (2MB)
      const slicedBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
      await window.electronAPI.saveDatabase(slicedBuffer as any);
    } else {
      await set('spotify_local_sqlite_db', binary);
    }
  } catch (err) {
    console.error('Failed to persist SQLite database:', err);
  }
}

/**
 * Loads the SQLite database from disk (Electron) or IndexedDB (Browser/Capacitor)
 */
export async function initSQLiteLibrary(): Promise<boolean> {
  try {
    let binary: Uint8Array | undefined;
    if (window.electronAPI?.isElectron) {
      const buffer = await window.electronAPI.loadDatabase();
      if (buffer) {
        binary = new Uint8Array(buffer as any);
      }
    } else {
      const cached = await get<Uint8Array | ArrayBuffer>('spotify_local_sqlite_db');
      if (cached) {
        binary = new Uint8Array(cached as any);
      }
    }
    const db = await getDatabase(binary);
    return !!db;
  } catch (err) {
    console.error('Failed to initialize SQLite database cache:', err);
    return false;
  }
}

/**
 * Loads the library state from the SQLite database.
 * Restores file blobs if they were stored offline.
 */
export async function loadCachedLibrary(): Promise<Track[]> {
  // Ensure DB is initialized
  const dbOk = await initSQLiteLibrary();
  if (!dbOk) {
    console.warn('SQLite library cache is unavailable.');
    return [];
  }

  const { tracks: cachedTracks } = await loadTracksFromSQLite();

  // Electron tracks are read directly from their authorized file paths. Looking
  // up an offline Blob for every cached track adds hundreds/thousands of
  // sequential IndexedDB reads and delays the first paint for no benefit.
  if (window.electronAPI?.isElectron) {
    return cachedTracks;
  }
  
  // Re-link offline blobs if they exist
  const tracksWithBlobs = await Promise.all(cachedTracks.map(async track => {
    const offlineBlob = await get<File>(`${OFFLINE_BLOBS_PREFIX}${track.id}`);
    if (offlineBlob) {
      return {
        ...track,
        fileBlob: offlineBlob,
      };
    }
    return track;
  }));

  return tracksWithBlobs;
}

/**
 * Saves the library state to SQLite and persists the database.
 */
export async function saveLibraryToCache(tracks: Track[], folders: string[]) {
  // Save metadata to SQLite database
  await saveTracksToSQLite(tracks, folders);
  
  // Also save folders list separately to cache (compatibility check)
  await set('spotify_local_folders', folders);

  // Persist the binary DB file
  await persistSQLiteDB();
}

/**
 * Clears a track's offline blob storage.
 */
export async function removeTrackOfflineBlob(trackId: string) {
  await del(`${OFFLINE_BLOBS_PREFIX}${trackId}`);
}

/**
 * Stores the Directory Handles for auto-reloading on desktop.
 */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const existingHandles = (await get<FileSystemDirectoryHandle[]>(DIRECTORY_HANDLE_KEY)) || [];
  // Prevent duplicates
  const isDup = existingHandles.some(h => h.name === handle.name);
  if (!isDup) {
    existingHandles.push(handle);
    await set(DIRECTORY_HANDLE_KEY, existingHandles);
  }
}

/**
 * Retrieves stored Directory Handles.
 */
export async function getSavedDirectoryHandles(): Promise<FileSystemDirectoryHandle[]> {
  return (await get<FileSystemDirectoryHandle[]>(DIRECTORY_HANDLE_KEY)) || [];
}

/**
 * Removes a directory handle and deletes all associated tracks from the database.
 */
export async function removeDirectoryHandle(folderName: string, tracks: Track[]): Promise<Track[]> {
  const handles = (await get<FileSystemDirectoryHandle[]>(DIRECTORY_HANDLE_KEY)) || [];
  const updatedHandles = handles.filter(h => h.name !== folderName);
  await set(DIRECTORY_HANDLE_KEY, updatedHandles);

  // Remove tracks belonging to this folder path
  const remainingTracks: Track[] = [];
  for (const track of tracks) {
    // Check if the track's path starts with folderName
    const pathParts = track.filePath.split('/');
    if (pathParts[0] === folderName) {
      // Delete offline blob if exists
      await removeTrackOfflineBlob(track.id);
    } else {
      remainingTracks.push(track);
    }
  }

  const folders = (await get<string[]>('spotify_local_folders')) || [];
  const updatedFolders = folders.filter(f => f !== folderName);

  await saveLibraryToCache(remainingTracks, updatedFolders);
  return remainingTracks;
}

export async function loadCachedPlaylists(): Promise<Playlist[]> {
  const dbOk = await initSQLiteLibrary();
  if (!dbOk) return [];
  return loadPlaylistsFromSQLite();
}

export async function savePlaylistsToCache(playlists: Playlist[]) {
  const dbOk = await initSQLiteLibrary();
  if (!dbOk) return;
  await savePlaylistsToSQLite(playlists);
  await persistSQLiteDB();
}

export async function incrementPlayCount(trackId: string): Promise<{ playCount: number; lastPlayed: number } | null> {
  const result = await incrementPlayCountInSQLite(trackId);
  if (result) {
    await persistSQLiteDB();
  }
  return result;
}

export async function toggleFavorite(trackId: string): Promise<boolean | null> {
  const result = await toggleFavoriteInSQLite(trackId);
  if (result !== null) {
    await persistSQLiteDB();
  }
  return result;
}
