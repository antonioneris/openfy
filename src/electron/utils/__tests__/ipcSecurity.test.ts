import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  assertPathAllowed,
  assertTrustedSender,
  authorizeRoot,
  initializePathRegistry,
  requireHttpUrl
} from '../ipcSecurity.cjs';

describe('ipcSecurity', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'openfy-security-'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('allows only paths inside a folder explicitly authorized by the user', () => {
    const userData = path.join(sandbox, 'userData');
    const temp = path.join(sandbox, 'temp');
    const music = path.join(sandbox, 'music');
    fs.mkdirSync(userData);
    fs.mkdirSync(temp);
    fs.mkdirSync(music);

    initializePathRegistry(userData, temp);
    authorizeRoot(music);

    expect(assertPathAllowed(path.join(music, 'album', 'track.mp3'), ['.mp3']))
      .toBe(path.join(fs.realpathSync(music), 'album', 'track.mp3'));
    expect(() => assertPathAllowed(path.join(sandbox, 'private.txt'))).toThrow('Acesso negado');
    expect(() => assertPathAllowed(path.join(music, 'cover.exe'), ['.jpg'])).toThrow('tipo de arquivo');
  });

  it('accepts only local application IPC senders', () => {
    expect(() => assertTrustedSender({ senderFrame: { url: 'file:///app/index.html' } })).not.toThrow();
    expect(() => assertTrustedSender({ senderFrame: { url: 'http://127.0.0.1:5173/' } })).not.toThrow();
    expect(() => assertTrustedSender({ senderFrame: { url: 'https://evil.example/' } })).toThrow('Origem IPC');
  });

  it('blocks non-HTTP external URLs', () => {
    expect(requireHttpUrl('https://open.spotify.com/track/123')).toBe('https://open.spotify.com/track/123');
    expect(() => requireHttpUrl('file:///etc/passwd')).toThrow('HTTP ou HTTPS');
    expect(() => requireHttpUrl('javascript:alert(1)')).toThrow('HTTP ou HTTPS');
  });
});
