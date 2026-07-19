const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanAudioFiles } = require('../directoryScanner.cjs');

describe('directoryScanner', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openfy-scanner-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds supported audio recursively and ignores unsupported files', async () => {
    const nested = path.join(root, 'nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(root, 'song.mp3'), 'audio');
    fs.writeFileSync(path.join(root, 'song.lrc'), '[00:00]test');
    fs.writeFileSync(path.join(nested, 'track.flac'), 'audio');
    fs.writeFileSync(path.join(nested, 'cover.jpg'), 'image');

    const discovered = [];
    const files = await scanAudioFiles(root, { onDiscovered: count => discovered.push(count) });

    expect(files.map(file => file.fileName).sort()).toEqual(['song.mp3', 'track.flac']);
    expect(files.find(file => file.fileName === 'song.mp3').hasLrc).toBe(true);
    expect(discovered).toEqual([1, 2]);
  });

  it('returns an empty list for a folder without supported audio', async () => {
    fs.writeFileSync(path.join(root, 'notes.txt'), 'nothing to scan');
    await expect(scanAudioFiles(root)).resolves.toEqual([]);
  });

  it('cancels during recursive discovery', async () => {
    fs.writeFileSync(path.join(root, 'a.mp3'), 'audio');
    fs.writeFileSync(path.join(root, 'b.mp3'), 'audio');
    let cancelled = false;

    await expect(scanAudioFiles(root, {
      isCancelled: () => cancelled,
      onDiscovered: () => { cancelled = true; },
    })).rejects.toMatchObject({ code: 'SCAN_CANCELLED' });
  });
});
