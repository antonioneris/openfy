const mockIdbGet = jest.fn();

jest.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockIdbGet(...args),
  set: jest.fn(),
  del: jest.fn(),
}));

jest.mock('../sqliteDatabase', () => ({
  getDatabase: jest.fn().mockResolvedValue({}),
  loadTracksFromSQLite: jest.fn().mockResolvedValue({
    tracks: [{
      id: '/music/cached.mp3', title: 'Cached', artist: 'Artist', album: 'Album', duration: 1,
      fileName: 'cached.mp3', filePath: '/music/cached.mp3', lastModified: 1, hasLrcFile: false,
    }],
    folders: ['/music'],
  }),
  saveTracksToSQLite: jest.fn(),
  loadPlaylistsFromSQLite: jest.fn(),
  savePlaylistsToSQLite: jest.fn(),
  exportSQLiteDatabase: jest.fn(),
  incrementPlayCountInSQLite: jest.fn(),
  toggleFavoriteInSQLite: jest.fn(),
  isTrackInFolder: jest.fn(),
  deduplicateTracks: (tracks: unknown[]) => tracks,
}));

import { loadCachedLibrary } from '../libraryEngine';

describe('Electron library cache', () => {
  it('returns SQLite tracks without one IndexedDB lookup per song', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        loadDatabase: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
        getWasmBinary: jest.fn(),
      },
    });

    await expect(loadCachedLibrary()).resolves.toHaveLength(1);
    expect(mockIdbGet).not.toHaveBeenCalled();
  });
});
