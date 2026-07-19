import { getBinaryDownloads, runExecutable } from '../ytdlpService.cjs';

describe('external process runner', () => {
  it('passes arguments literally without invoking a shell', async () => {
    const hostileArgument = 'title"; touch /tmp/should-not-run; #';
    const output = await runExecutable(process.execPath, [
      '-e',
      'process.stdout.write(process.argv[1])',
      hostileArgument
    ]);

    expect(output).toBe(hostileArgument);
  });

  it('selects x64 Linux binaries for the private player dependencies', () => {
    const downloads = getBinaryDownloads('linux', 'x64');

    expect(downloads.ytDlp).toContain('/yt-dlp_linux');
    expect(downloads.ffmpeg).toContain('/ffmpeg-linux-x64.gz');
    expect(downloads.ffprobe).toContain('/ffprobe-linux-x64.gz');
  });
});
