import { getYouTubeIdFromTrack, isFolderManifestUnchanged, scanFileList, withOperationTimeout } from '../libraryEngine';
import type { Track } from '../../shared/types';

describe('getYouTubeIdFromTrack', () => {
  const makeTrack = (overrides: Partial<Track> = {}): Track => ({
    id: 'test-id',
    title: 'Test',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    fileName: 'test.mp3',
    filePath: '/test.mp3',
    lastModified: 0,
    hasLrcFile: false,
    ...overrides,
  });

  it('extracts 11-char YouTube ID from bracketed format in fileName', () => {
    const track = makeTrack({ fileName: 'dQw4w9WgXcQ[abc123defgh].mp3' });
    expect(getYouTubeIdFromTrack(track)).toBe('abc123defgh');
  });

  it('extracts 11-char YouTube ID from bracketed format in filePath', () => {
    const track = makeTrack({ fileName: '', filePath: '/folder/dQw4w9WgXcQ.mp3' });
    // filePath has no bracketed ID, returns null
    expect(getYouTubeIdFromTrack(track)).toBeNull();
  });

  it('returns null when no YouTube ID found', () => {
    const track = makeTrack({ fileName: 'regular-song.mp3' });
    expect(getYouTubeIdFromTrack(track)).toBeNull();
  });

  it('returns null for empty source fields', () => {
    const track = makeTrack({ fileName: '', filePath: '' });
    expect(getYouTubeIdFromTrack(track)).toBeNull();
  });

  it('extracts real-world YouTube ID format', () => {
    const track = makeTrack({ fileName: 'My Song [dQw4w9WgXcQ].mp3' });
    expect(getYouTubeIdFromTrack(track)).toBe('dQw4w9WgXcQ');
  });
});

describe('scanFileList progress and cancellation', () => {
  const cachedTrack = (file: File): Track => ({
    id: file.name,
    title: file.name,
    artist: 'Artist',
    album: 'Album',
    duration: 1,
    fileName: file.name,
    filePath: file.name,
    lastModified: file.lastModified,
    hasLrcFile: false,
  });

  it('reports deterministic progress for cached files', async () => {
    const files = [new File(['a'], 'a.mp3'), new File(['b'], 'b.m4a')];
    const progress: Array<[number, number]> = [];
    const existing = new Map(files.map(file => [file.name, cachedTrack(file)]));

    const tracks = await scanFileList(files, existing, false, (processed, total) => {
      progress.push([processed, total]);
    });

    expect(tracks).toHaveLength(2);
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  it('aborts before returning a partial library', async () => {
    const files = [new File(['a'], 'a.mp3'), new File(['b'], 'b.mp3')];
    const existing = new Map(files.map(file => [file.name, cachedTrack(file)]));
    let cancelled = false;

    await expect(scanFileList(
      files,
      existing,
      false,
      (processed) => { cancelled = processed === 1; },
      () => cancelled
    )).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('withOperationTimeout', () => {
  afterEach(() => jest.useRealTimers());

  it('prevents one unreadable file from blocking the scan forever', async () => {
    jest.useFakeTimers();
    const pending = withOperationTimeout(new Promise(() => {}), 10000, 'METADATA_TIMEOUT');
    jest.advanceTimersByTime(10000);
    await expect(pending).rejects.toThrow('METADATA_TIMEOUT');
  });
});

describe('isFolderManifestUnchanged', () => {
  const track = (filePath: string, lastModified: number): Track => ({
    id: filePath, title: filePath, artist: 'Artist', album: 'Album', duration: 1,
    fileName: filePath, filePath, lastModified, hasLrcFile: false,
  });

  it('skips metadata processing when paths and timestamps are unchanged', () => {
    const cached = [track('/music/a.mp3', 1), track('/music/b.flac', 2)];
    expect(isFolderManifestUnchanged([
      { filePath: '/music/a.mp3', lastModified: 1 },
      { filePath: '/music/b.flac', lastModified: 2 },
    ], cached)).toBe(true);
  });

  it('detects added, removed, or modified files', () => {
    const cached = [track('/music/a.mp3', 1)];
    expect(isFolderManifestUnchanged([], cached)).toBe(false);
    expect(isFolderManifestUnchanged([{ filePath: '/music/a.mp3', lastModified: 2 }], cached)).toBe(false);
    expect(isFolderManifestUnchanged([
      { filePath: '/music/a.mp3', lastModified: 1 },
      { filePath: '/music/b.mp3', lastModified: 1 },
    ], cached)).toBe(false);
  });
});
