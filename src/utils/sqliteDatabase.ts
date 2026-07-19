import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import type { Track, Playlist } from './libraryEngine';

let dbInstance: Database | null = null;
let SQL: any = null;
let sqliteSupported = true;

/**
 * Initializes and returns the shared sql.js Database instance.
 * Optionally opens the database with a loaded Uint8Array binary file.
 * Returns null if SQLite/WebAssembly is not supported or fails to initialize.
 */
export async function getDatabase(binaryData?: Uint8Array): Promise<Database | null> {
  if (!sqliteSupported) {
    return null;
  }

  if (dbInstance && !binaryData) {
    return dbInstance;
  }

  try {
    if (!SQL) {
      const config: any = {};
      if (window.electronAPI?.isElectron) {
        try {
          const wasmBinary = window.electronAPI.getWasmBinary();
          if (wasmBinary) {
            config.wasmBinary = wasmBinary;
          } else {
            config.locateFile = (file: string) => `/${file}`;
          }
        } catch (err) {
          console.error('Failed to retrieve preloaded WASM binary:', err);
          config.locateFile = (file: string) => `/${file}`;
        }
      } else {
        config.locateFile = (file: string) => `/${file}`;
      }

      SQL = await initSqlJs(config);
    }

    if (binaryData && binaryData.length > 0) {
      const openedDatabase = new SQL.Database(binaryData);
      dbInstance = openedDatabase;
    } else if (!dbInstance) {
      dbInstance = new SQL.Database();
    }
  } catch (err) {
    console.error('Failed to initialize sql.js/WebAssembly engine:', err);
    sqliteSupported = false;
    dbInstance = null;
    return null;
  }

  const db = dbInstance!;

  // Create tables if they do not exist
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration REAL,
        trackNumber INTEGER,
        year INTEGER,
        coverArt TEXT,
        embeddedLyrics TEXT,
        fileName TEXT,
        filePath TEXT,
        lastModified INTEGER,
        hasLrcFile INTEGER,
        lrcContent TEXT,
        playCount INTEGER DEFAULT 0,
        lastPlayed INTEGER DEFAULT 0,
        isFavorite INTEGER DEFAULT 0,
        genre TEXT
      );
      CREATE TABLE IF NOT EXISTS folders (
        name TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT,
        trackIds TEXT,
        ytPlaylistId TEXT,
        coverUrl TEXT
      );
    `);

    // Schema Migrations - add columns if they do not exist
    try { db.run("ALTER TABLE tracks ADD COLUMN playCount INTEGER DEFAULT 0;"); } catch (_e) { /* column may already exist */ }
    try { db.run("ALTER TABLE tracks ADD COLUMN lastPlayed INTEGER DEFAULT 0;"); } catch (_e) { /* column may already exist */ }
    try { db.run("ALTER TABLE tracks ADD COLUMN isFavorite INTEGER DEFAULT 0;"); } catch (_e) { /* column may already exist */ }
    try { db.run("ALTER TABLE tracks ADD COLUMN genre TEXT;"); } catch (_e) { /* column may already exist */ }
    try { db.run("ALTER TABLE playlists ADD COLUMN ytPlaylistId TEXT;"); } catch (_e) { /* column may already exist */ }
    try { db.run("ALTER TABLE playlists ADD COLUMN coverUrl TEXT;"); } catch (_e) { /* column may already exist */ }
  } catch (err) {
    console.error('Failed to create/migrate SQLite tables:', err);
    sqliteSupported = false;
    dbInstance = null;
    return null;
  }

  return db;
}

/**
 * Clears old cache tables and inserts updated track metadata and folder listings.
 * Preserves stats for existing tracks.
 */
export async function saveTracksToSQLite(tracks: Track[], folders: string[]) {
  const db = await getDatabase();
  if (!db) return;
  
  try {
    const uniqueTracks = deduplicateTracks(tracks);

    // Preserve existing statistics
    const statsMap = new Map<string, { playCount: number; lastPlayed: number; isFavorite: number }>();
    try {
      const stmt = db.prepare("SELECT id, playCount, lastPlayed, isFavorite FROM tracks;");
      while (stmt.step()) {
        const row = stmt.getAsObject();
        statsMap.set(row.id as string, {
          playCount: (row.playCount as number) || 0,
          lastPlayed: (row.lastPlayed as number) || 0,
          isFavorite: (row.isFavorite as number) || 0
        });
      }
      stmt.free();
    } catch (err) {
      console.warn('Failed to pre-fetch track stats for preservation:', err);
    }

    // Clear old values in this transaction
    db.run("DELETE FROM tracks;");
    db.run("DELETE FROM folders;");

    const insertTrack = db.prepare(`
      INSERT OR REPLACE INTO tracks (
        id, title, artist, album, duration, trackNumber, year, coverArt, 
        embeddedLyrics, fileName, filePath, lastModified, hasLrcFile, lrcContent,
        playCount, lastPlayed, isFavorite, genre
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    uniqueTracks.forEach(t => {
      const stats = statsMap.get(t.id) || {
        playCount: t.playCount || 0,
        lastPlayed: t.lastPlayed || 0,
        isFavorite: t.isFavorite ? 1 : 0
      };

      insertTrack.run([
        t.id,
        t.title || '',
        t.artist || 'Artista Desconhecido',
        t.album || 'Álbum Desconhecido',
        t.duration || 0,
        t.trackNumber !== undefined ? t.trackNumber : null,
        t.year !== undefined ? t.year : null,
        t.coverArt || null,
        t.embeddedLyrics || null,
        t.fileName || '',
        t.filePath || '',
        t.lastModified || 0,
        t.hasLrcFile ? 1 : 0,
        t.lrcContent || null,
        stats.playCount,
        stats.lastPlayed,
        stats.isFavorite,
        t.genre || null
      ]);
    });
    insertTrack.free();

    const seenFolders = new Set<string>();
    const uniqueFolders: string[] = [];
    folders.forEach(f => {
      const normalized = f.replace(/\\/g, '/').toLowerCase();
      if (!seenFolders.has(normalized)) {
        seenFolders.add(normalized);
        uniqueFolders.push(f);
      }
    });

    // Older OpenFy databases used (id, path, addedAt, lastScannedAt). Keep
    // writing that schema until the next normal export instead of making a
    // valid existing cache unusable after an application update.
    const folderColumns = getTableColumns(db, 'folders');
    const usesLegacyFolderSchema = !folderColumns.has('name') && folderColumns.has('path');
    const insertFolder = usesLegacyFolderSchema
      ? db.prepare("INSERT OR REPLACE INTO folders (id, path, addedAt, lastScannedAt) VALUES (?, ?, ?, ?);")
      : db.prepare("INSERT OR REPLACE INTO folders (name) VALUES (?);");
    const now = Date.now();
    uniqueFolders.forEach(f => {
      insertFolder.run(usesLegacyFolderSchema ? [f, f, now, now] : [f]);
    });
    insertFolder.free();
  } catch (err) {
    console.error('Failed to save tracks to SQLite database:', err);
  }
}

/**
 * Loads tracks and folders lists from the SQLite database.
 */
export async function loadTracksFromSQLite(): Promise<{ tracks: Track[]; folders: string[] }> {
  const db = await getDatabase();
  if (!db) {
    return { tracks: [], folders: [] };
  }
  
  const tracks: Track[] = [];
  let stmt: ReturnType<Database['prepare']> | null = null;
  try {
    stmt = db.prepare("SELECT * FROM tracks;");
    while (stmt.step()) {
      const row = stmt.getAsObject();
      tracks.push({
        id: row.id as string,
        title: row.title as string,
        artist: row.artist as string,
        album: row.album as string,
        duration: row.duration as number,
        trackNumber: row.trackNumber !== null ? (row.trackNumber as number) : undefined,
        year: row.year !== null ? (row.year as number) : undefined,
        coverArt: (row.coverArt as string) || undefined,
        embeddedLyrics: (row.embeddedLyrics as string) || undefined,
        fileName: row.fileName as string,
        filePath: row.filePath as string,
        lastModified: row.lastModified as number,
        hasLrcFile: !!row.hasLrcFile,
        lrcContent: (row.lrcContent as string) || undefined,
        playCount: (row.playCount as number) || 0,
        lastPlayed: (row.lastPlayed as number) || 0,
        isFavorite: row.isFavorite === 1,
        genre: (row.genre as string) || undefined
      });
    }
  } catch (err) {
    console.error('Failed to load tracks from SQLite database:', err);
  } finally {
    stmt?.free();
  }

  const folders: string[] = [];
  let folderStmt: ReturnType<Database['prepare']> | null = null;
  try {
    const folderColumns = getTableColumns(db, 'folders');
    const folderColumn = folderColumns.has('name') ? 'name' : folderColumns.has('path') ? 'path' : null;
    if (!folderColumn) return { tracks, folders };

    folderStmt = db.prepare(`SELECT ${folderColumn} FROM folders;`);
    while (folderStmt.step()) {
      const row = folderStmt.getAsObject();
      folders.push(row[folderColumn] as string);
    }
  } catch (err) {
    // Folder metadata is auxiliary. A schema mismatch must never discard the
    // successfully loaded music library.
    console.warn('Failed to load folders from SQLite database:', err);
  } finally {
    folderStmt?.free();
  }

  return { tracks, folders };
}

function getTableColumns(db: Database, table: string): Set<string> {
  const result = db.exec(`PRAGMA table_info(${table});`)[0];
  if (!result) return new Set();
  const nameIndex = result.columns.indexOf('name');
  if (nameIndex < 0) return new Set();
  return new Set(result.values.map(row => String(row[nameIndex])));
}

/**
 * Increments play count and updates last played timestamp for a track in SQLite.
 */
export async function incrementPlayCountInSQLite(trackId: string): Promise<{ playCount: number; lastPlayed: number } | null> {
  const db = await getDatabase();
  if (!db) return null;
  try {
    const timestamp = Date.now();
    db.run("UPDATE tracks SET playCount = playCount + 1, lastPlayed = ? WHERE id = ?;", [timestamp, trackId]);
    
    // Get updated values to return
    const stmt = db.prepare("SELECT playCount, lastPlayed FROM tracks WHERE id = ?;");
    stmt.bind([trackId]);
    let result = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      result = {
        playCount: row.playCount as number,
        lastPlayed: row.lastPlayed as number
      };
    }
    stmt.free();
    return result;
  } catch (err) {
    console.error('Failed to increment play count in SQLite:', err);
    return null;
  }
}

/**
 * Toggles the favorite status of a track in SQLite.
 */
export async function toggleFavoriteInSQLite(trackId: string): Promise<boolean | null> {
  const db = await getDatabase();
  if (!db) return null;
  try {
    db.run("UPDATE tracks SET isFavorite = 1 - isFavorite WHERE id = ?;", [trackId]);
    
    // Get updated value
    const stmt = db.prepare("SELECT isFavorite FROM tracks WHERE id = ?;");
    stmt.bind([trackId]);
    let result = false;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      result = row.isFavorite === 1;
    }
    stmt.free();
    return result;
  } catch (err) {
    console.error('Failed to toggle favorite in SQLite:', err);
    return null;
  }
}

/**
 * Saves all user playlists to the SQLite database.
 */
export async function savePlaylistsToSQLite(playlists: Playlist[]) {
  const db = await getDatabase();
  if (!db) return;

  try {
    db.run("DELETE FROM playlists;");

    const stmt = db.prepare("INSERT OR REPLACE INTO playlists (id, name, trackIds, ytPlaylistId, coverUrl) VALUES (?, ?, ?, ?, ?);");
    playlists.forEach(p => {
      stmt.run([p.id, p.name, JSON.stringify(p.trackIds), p.ytPlaylistId || null, p.coverUrl || null]);
    });
    stmt.free();
  } catch (err) {
    console.error('Failed to save playlists to SQLite database:', err);
  }
}

/**
 * Loads all user playlists from the SQLite database.
 */
export async function loadPlaylistsFromSQLite(): Promise<Playlist[]> {
  const db = await getDatabase();
  if (!db) {
    return [];
  }
  
  try {
    const playlists: Playlist[] = [];
    const stmt = db.prepare("SELECT * FROM playlists;");
    while (stmt.step()) {
      const row = stmt.getAsObject();
      let trackIds: string[] = [];
      try {
        trackIds = JSON.parse(row.trackIds as string);
      } catch (_err) {
        trackIds = row.trackIds ? (row.trackIds as string).split(',').filter(Boolean) : [];
      }
      playlists.push({
        id: row.id as string,
        name: row.name as string,
        trackIds,
        ytPlaylistId: (row.ytPlaylistId as string) || undefined,
        coverUrl: (row.coverUrl as string) || undefined
      });
    }
    stmt.free();

    return playlists;
  } catch (err) {
    console.error('Failed to load playlists from SQLite database:', err);
    return [];
  }
}

/**
 * Exports SQLite database as a binary array.
 */
export async function exportSQLiteDatabase(): Promise<Uint8Array | null> {
  const db = await getDatabase();
  if (!db) return null;
  
  try {
    return db.export();
  } catch (err) {
    console.error('Failed to export SQLite database:', err);
    return null;
  }
}

/**
 * Updates track metadata in SQLite.
 */
export async function updateTrackMetadataInSQLite(
  trackId: string,
  fields: {
    title?: string;
    artist?: string;
    album?: string;
    year?: number | null;
    trackNumber?: number | null;
    genre?: string | null;
    coverArt?: string | null;
  }
): Promise<boolean> {
  const db = await getDatabase();
  if (!db) return false;

  try {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (fields.title !== undefined) {
      sets.push('title = ?');
      values.push(fields.title);
    }
    if (fields.artist !== undefined) {
      sets.push('artist = ?');
      values.push(fields.artist);
    }
    if (fields.album !== undefined) {
      sets.push('album = ?');
      values.push(fields.album);
    }
    if (fields.year !== undefined) {
      sets.push('year = ?');
      values.push(fields.year);
    }
    if (fields.trackNumber !== undefined) {
      sets.push('trackNumber = ?');
      values.push(fields.trackNumber);
    }
    if (fields.genre !== undefined) {
      sets.push('genre = ?');
      values.push(fields.genre);
    }
    if (fields.coverArt !== undefined) {
      sets.push('coverArt = ?');
      values.push(fields.coverArt);
    }

    if (sets.length === 0) return true;

    values.push(trackId);
    db.run(`UPDATE tracks SET ${sets.join(', ')} WHERE id = ?;`, values);
    return true;
  } catch (err) {
    console.error('Failed to update track metadata in SQLite:', err);
    return false;
  }
}

/**
 * Updates playlist metadata in SQLite.
 */
export async function updatePlaylistMetadataInSQLite(
  playlistId: string,
  fields: {
    name?: string;
    coverUrl?: string | null;
  }
): Promise<boolean> {
  const db = await getDatabase();
  if (!db) return false;

  try {
    const sets: string[] = [];
    const values: (string | null)[] = [];

    if (fields.name !== undefined) {
      sets.push('name = ?');
      values.push(fields.name);
    }
    if (fields.coverUrl !== undefined) {
      sets.push('coverUrl = ?');
      values.push(fields.coverUrl);
    }

    if (sets.length === 0) return true;

    values.push(playlistId);
    db.run(`UPDATE playlists SET ${sets.join(', ')} WHERE id = ?;`, values);
    return true;
  } catch (err) {
    console.error('Failed to update playlist metadata in SQLite:', err);
    return false;
  }
}

export function isTrackInFolder(trackPath: string, folderPath: string): boolean {
  if (!trackPath || !folderPath) return false;
  const normTrack = trackPath.replace(/\\/g, '/').toLowerCase();
  const normFolder = folderPath.replace(/\\/g, '/').toLowerCase();
  
  const folderPrefix = normFolder.endsWith('/') ? normFolder : normFolder + '/';
  return normTrack.startsWith(folderPrefix);
}

export function deduplicateTracks(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>();
  for (const track of tracks) {
    if (!track.filePath) continue;
    const key = track.filePath.replace(/\\/g, '/').toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...track });
    } else {
      const merged: Track = {
        ...existing,
        ...track,
        coverArt: track.coverArt || existing.coverArt,
        embeddedLyrics: track.embeddedLyrics || existing.embeddedLyrics,
        lrcContent: track.lrcContent || existing.lrcContent,
        hasLrcFile: track.hasLrcFile || existing.hasLrcFile,
        playCount: Math.max(track.playCount || 0, existing.playCount || 0),
        lastPlayed: Math.max(track.lastPlayed || 0, existing.lastPlayed || 0),
        isFavorite: track.isFavorite || existing.isFavorite,
        fileHandle: track.fileHandle || existing.fileHandle,
        fileBlob: track.fileBlob || existing.fileBlob,
      };
      merged.id = existing.id;
      merged.filePath = existing.filePath;
      seen.set(key, merged);
    }
  }
  return Array.from(seen.values());
}
