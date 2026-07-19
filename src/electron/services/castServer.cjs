const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const state = require('../utils/state.cjs');
const { normalizeCastPlayerResponses } = require('./castResponseNormalizer.cjs');

let Bonjour, castv2Client;
try {
  Bonjour = require('bonjour-service');
} catch (e) {
  console.warn('bonjour-service not available:', e.message);
}
try {
  castv2Client = require('castv2-client');
} catch (e) {
  console.warn('castv2-client not available:', e.message);
}

const castPort = 8083;
// Helper: Get local IPv4 address, matching target device subnet if possible
function getLocalIpAddress(targetDeviceIp = null) {
  const interfaces = os.networkInterfaces();
  let candidateIps = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidateIps.push({
          name: name.toLowerCase(),
          address: iface.address
        });
      }
    }
  }

  if (candidateIps.length === 0) {
    return 'localhost';
  }

  // If a target device IP is provided, look for an interface on the same subnet
  if (targetDeviceIp) {
    const targetParts = targetDeviceIp.split('.');
    for (const cand of candidateIps) {
      const candParts = cand.address.split('.');
      if (
        candParts[0] === targetParts[0] &&
        candParts[1] === targetParts[1] &&
        candParts[2] === targetParts[2]
      ) {
        console.log(`[Cast] Selected local IP ${cand.address} matching subnet of Chromecast IP ${targetDeviceIp}`);
        return cand.address;
      }
    }
  }

  // Fallback 1: Prefer Wi-Fi or Ethernet interfaces (en0, en1, eth0, wlan0, etc.)
  // and avoid virtual interfaces (docker, vbox, virtual, utun, etc.)
  const preferred = candidateIps.find(cand => 
    (cand.name.startsWith('en') || cand.name.startsWith('wlan') || cand.name.startsWith('eth') || cand.name.startsWith('wi-fi') || cand.name.startsWith('ethernet')) &&
    !cand.name.includes('virtual') && !cand.name.includes('vbox') && !cand.name.includes('docker') && !cand.name.includes('vpn')
  );
  if (preferred) {
    return preferred.address;
  }

  // Fallback 2: Avoid common virtualized/VPN interface names
  const nonVirtual = candidateIps.find(cand => 
    !cand.name.includes('virtual') && !cand.name.includes('vbox') && !cand.name.includes('docker') && !cand.name.includes('vpn') && !cand.name.includes('utun')
  );
  if (nonVirtual) {
    return nonVirtual.address;
  }

  // Fallback 3: Return the first available interface
  return candidateIps[0].address;
}

// Helper: Get audio MIME type from file extension
function getAudioContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.wav') return 'audio/wav';
  return 'audio/mpeg';
}

function upgradeCoverResolution(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('googleusercontent.com')) {
    let upgraded = url.replace(/=w\d+-h\d+[^=]*$/, '=w1000-h1000-s-l90-rj');
    if (upgraded === url) {
      upgraded = url.replace(/=s\d+[^=]*$/, '=s1000-c');
    }
    return upgraded;
  }
  if (url.includes('ytimg.com/vi/')) {
    return url.replace(/\/(default|hqdefault|mqdefault|sddefault)\.jpg$/, '/maxresdefault.jpg');
  }
  return url;
}

function formatVttTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  const pad = (num, size) => ('000' + num).slice(-size);
  return `${pad(hrs, 2)}:${pad(mins, 2)}:${pad(secs, 2)}.${pad(ms, 3)}`;
}

function generateVttLyrics(lyrics) {
  let vtt = 'WEBVTT\n\n';
  if (!lyrics || !Array.isArray(lyrics) || lyrics.length === 0) {
    return vtt;
  }
  for (let i = 0; i < lyrics.length; i++) {
    const start = lyrics[i].time;
    const end = (i + 1 < lyrics.length) ? lyrics[i + 1].time : start + 5.0;
    vtt += `${formatVttTime(start)} --> ${formatVttTime(end)}\n`;
    vtt += `${lyrics[i].text}\n\n`;
  }
  return vtt;
}

// Create Local Cast HTTP Server
const castServer = http.createServer((req, res) => {
  const urlPath = req.url;

  // Set CORS headers for all incoming requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

  // Handle pre-flight request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (urlPath.startsWith('/cast')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getCastHtmlPage());
  } else if (urlPath.startsWith('/events')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('\n');
    state.sseClients.push(res);

    // Push current state immediately
    const payload = JSON.stringify({ event: 'state', data: state.currentPlaybackState });
    res.write(`data: ${payload}\n\n`);

    req.on('close', () => {
      state.sseClients = state.sseClients.filter(c => c !== res);
    });
  } else if (urlPath.startsWith('/cover')) {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const action = urlObj.searchParams.get('action');

    let coverArt = state.currentPlaybackState.coverArt;
    if (action === 'prev' && state.currentPlaybackState.hasPrev && state.currentPlaybackState.prevTrack) {
      coverArt = state.currentPlaybackState.prevTrack.coverArt;
    } else if (action === 'next' && state.currentPlaybackState.hasNext && state.currentPlaybackState.nextTrack) {
      coverArt = state.currentPlaybackState.nextTrack.coverArt;
    }

    if (coverArt) {
      if (coverArt.startsWith('data:image')) {
        const matches = coverArt.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const type = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          res.writeHead(200, { 'Content-Type': type, 'Content-Length': buffer.length });
          res.end(buffer);
          return;
        }
      } else if (coverArt.startsWith('http://') || coverArt.startsWith('https://')) {
        const highResUrl = upgradeCoverResolution(coverArt);
        res.writeHead(302, { 'Location': highResUrl });
        res.end();
        return;
      }
    }
    const emptyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': emptyPng.length });
    res.end(emptyPng);
  } else if (urlPath.startsWith('/lyrics.vtt')) {
    const vttContent = generateVttLyrics(state.currentPlaybackState.lyrics);
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Content-Length': Buffer.byteLength(vttContent, 'utf8')
    });
    res.end(vttContent);
  } else if (urlPath.startsWith('/stream')) {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const action = urlObj.searchParams.get('action');

    let audioPath = state.currentPlaybackState.filePath;
    if (action === 'prev' && state.currentPlaybackState.hasPrev && state.currentPlaybackState.prevTrack) {
      audioPath = state.currentPlaybackState.prevTrack.filePath;
    } else if (action === 'next' && state.currentPlaybackState.hasNext && state.currentPlaybackState.nextTrack) {
      audioPath = state.currentPlaybackState.nextTrack.filePath;
    }

    if (!audioPath) {
      res.writeHead(404);
      res.end();
      return;
    }
    const nativePath = path.normalize(audioPath);
    if (!fs.existsSync(nativePath)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const stat = fs.statSync(nativePath);
    const contentType = getAudioContentType(nativePath);
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (isNaN(start)) start = 0;
      if (isNaN(end)) end = stat.size - 1;

      if (start >= stat.size || end >= stat.size) {
        res.writeHead(416, {
          'Content-Range': `bytes */${stat.size}`
        });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Connection': 'keep-alive'
      });
      fs.createReadStream(nativePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(nativePath).pipe(res);
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

castServer.on('error', (err) => {
  console.error('[Cast Server] Error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[Cast Server] Port ${castPort} is already in use.`);
  }
});

castServer.listen(castPort, '0.0.0.0', () => {
  console.log(`Local Cast server running at http://localhost:${castPort}`);
});

function startCastDiscovery() {
  if (!Bonjour) return;
  try {
    if (state.bonjourInstance) {
      try { state.bonjourBrowser && state.bonjourBrowser.stop(); } catch (_) {}
    }
    state.bonjourInstance = new Bonjour.Bonjour();
    state.discoveredCastDevices = [];

    state.bonjourBrowser = state.bonjourInstance.find({ type: 'googlecast', protocol: 'tcp' }, (service) => {
      const host = service.addresses && service.addresses[0] ? service.addresses[0] : service.host;
      const existing = state.discoveredCastDevices.find(d => d.host === host && d.port === service.port);
      if (!existing) {
        state.discoveredCastDevices.push({
          name: service.name || service.host,
          host,
          port: service.port || 8009,
          id: `${host}:${service.port || 8009}`
        });
        console.log('[Cast] Found device:', service.name, host);
      }
    });
    console.log('[Cast] mDNS discovery started for _googlecast._tcp');
  } catch (err) {
    console.error('[Cast] Failed to start Bonjour discovery:', err);
  }
}

function castToDevice(host, port) {
  if (!castv2Client) {
    return Promise.reject(new Error('castv2-client library not available'));
  }

  // Close any previous cast session
  if (state.activeCastClient) {
    try { state.activeCastClient.close(); } catch (_) {}
    state.activeCastClient = null;
    state.activeCastPlayer = null;
  }

  const localIp = getLocalIpAddress(host);
  const audioContentType = state.currentPlaybackState.filePath
    ? getAudioContentType(state.currentPlaybackState.filePath)
    : 'audio/mpeg';

  return new Promise((resolve, reject) => {
    const { Client, DefaultMediaReceiver } = castv2Client;
    const client = new Client();

    const timeout = setTimeout(() => {
      console.error('[Cast] Connection timed out to', host);
      try { client.close(); } catch (_) {}
      state.activeCastClient = null;
      state.activeCastPlayer = null;
      state.activeCastHost = null;
      reject(new Error('Conexão com Chromecast expirou (timeout)'));
    }, 15000);

    client.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[Cast] Client error:', err.message);
      try { client.close(); } catch (_) {}
      state.activeCastClient = null;
      state.activeCastPlayer = null;
      state.activeCastHost = null;
      reject(err);
    });

    client.connect({ host, port: port || 8009 }, () => {
      console.log('[Cast] Connected to', host);

      client.launch(DefaultMediaReceiver, (err, player) => {
        if (err) {
          clearTimeout(timeout);
          console.error('[Cast] Launch error:', err.message);
          try { client.close(); } catch (_) {}
          state.activeCastHost = null;
          return reject(err);
        }

        console.log('[Cast] DefaultMediaReceiver launched on', host);

        normalizeCastPlayerResponses(player);

        state.activeCastClient = client;
        state.activeCastPlayer = player;
        state.activeCastHost = host;

        player.on('status', (status) => {
          if (!status) return;

          if (status.items && Array.isArray(status.items)) {
            state.castQueueItems = { prevId: null, currentId: null, nextId: null };
            status.items.forEach(item => {
              if (item.media && item.media.contentId) {
                if (item.media.contentId.includes('action=prev')) {
                  state.castQueueItems.prevId = item.itemId;
                } else if (item.media.contentId.includes('action=current')) {
                  state.castQueueItems.currentId = item.itemId;
                } else if (item.media.contentId.includes('action=next')) {
                  state.castQueueItems.nextId = item.itemId;
                }
              }
            });
          }

          if (status.playerState) {
            console.log('[Cast] Player status:', status.playerState, 'currentItemId:', status.currentItemId);
            
            if (status.currentItemId !== undefined && status.currentItemId !== null) {
              if (state.castQueueItems.nextId && status.currentItemId === state.castQueueItems.nextId) {
                console.log('[Cast] TV Remote trigger -> NEXT track');
                state.castQueueItems = { prevId: null, currentId: null, nextId: null };
                if (state.mainWindow && !state.mainWindow.isDestroyed()) {
                  state.mainWindow.webContents.send('cast-skip-track', 'next');
                }
                return;
              } else if (state.castQueueItems.prevId && status.currentItemId === state.castQueueItems.prevId) {
                console.log('[Cast] TV Remote trigger -> PREVIOUS track');
                state.castQueueItems = { prevId: null, currentId: null, nextId: null };
                if (state.mainWindow && !state.mainWindow.isDestroyed()) {
                  state.mainWindow.webContents.send('cast-skip-track', 'prev');
                }
                return;
              }
            }

            const isPlaying = status.playerState === 'PLAYING' || status.playerState === 'BUFFERING';
            const currentTime = status.currentTime !== undefined ? status.currentTime : state.lastKnownCastState.currentTime;
            
            state.lastKnownCastState = { isPlaying, currentTime };

            if (state.mainWindow && !state.mainWindow.isDestroyed()) {
              state.mainWindow.webContents.send('cast-playback-changed', { isPlaying, currentTime });
            }
          }
        });

        const queueItems = [];
        const makeQueueItem = (trackData, actionType) => {
          const streamUrl = `http://${localIp}:${castPort}/stream?action=${actionType}&t=${Date.now()}`;
          const coverUrl = trackData.coverArt ? `http://${localIp}:${castPort}/cover?action=${actionType}&t=${Date.now()}` : '';
          return {
            media: {
              contentId: streamUrl,
              contentType: getAudioContentType(trackData.filePath || ''),
              streamType: 'BUFFERED',
              supportedMediaCommands: 207,
              metadata: {
                type: 0,
                metadataType: 3,
                title: trackData.title || 'OpenFy',
                artist: trackData.artist || '',
                albumName: trackData.album || '',
                images: coverUrl ? [{ url: coverUrl }] : []
              }
            },
            autoplay: true,
            startTime: state.currentPlaybackState.currentTime || 0
          };
        };

        if (state.currentPlaybackState.hasPrev && state.currentPlaybackState.prevTrack) {
          queueItems.push(makeQueueItem(state.currentPlaybackState.prevTrack, 'prev'));
        }
        
        queueItems.push(makeQueueItem(state.currentPlaybackState, 'current'));

        if (state.currentPlaybackState.hasNext && state.currentPlaybackState.nextTrack) {
          queueItems.push(makeQueueItem(state.currentPlaybackState.nextTrack, 'next'));
        }

        const startIndex = state.currentPlaybackState.hasPrev ? 1 : 0;
        state.castQueueItems = { prevId: null, currentId: null, nextId: null };

        player.queueLoad(queueItems, { startIndex, currentTime: state.currentPlaybackState.currentTime || 0, autoplay: true }, (loadErr, status) => {
          clearTimeout(timeout);
          if (loadErr) {
            console.error('[Cast] Initial queueLoad error, falling back to load:', loadErr.message);
            const media = makeQueueItem(state.currentPlaybackState, 'current').media;
            player.load(media, { autoplay: true, currentTime: state.currentPlaybackState.currentTime || 0 }, (err2) => {
              if (err2) return reject(err2);
              resolve({ success: true });
            });
          } else {
            console.log('[Cast] Initial queue loaded successfully on Chromecast');
            resolve({ success: true, status });
          }
        });
      });
    });
  });
}

function stopCasting() {
  try {
    if (state.activeCastPlayer) {
      try {
        state.activeCastPlayer.stop(() => {
          console.log('[Cast] Playback stopped on Chromecast');
        });
      } catch (e) {
        console.warn('[Cast] Error stopping player:', e.message);
      }
    }
    if (state.activeCastClient) {
      try { state.activeCastClient.close(); } catch (_) {}
    }
  } catch (err) {
    console.warn('[Cast] Error during stop:', err.message);
  }
  state.activeCastClient = null;
  state.activeCastPlayer = null;
  state.activeCastHost = null;
  return true;
}

function updateCastPlayback(playbackState, prevFilePath) {
  if (state.activeCastPlayer) {
    const newFilePath = playbackState.filePath;
    if (newFilePath && newFilePath !== prevFilePath) {
      try {
        const localIp = getLocalIpAddress(state.activeCastHost);
        const queueItems = [];

        const makeQueueItem = (trackData, actionType) => {
          const streamUrl = `http://${localIp}:${castPort}/stream?action=${actionType}&t=${Date.now()}`;
          const coverUrl = trackData.coverArt ? `http://${localIp}:${castPort}/cover?action=${actionType}&t=${Date.now()}` : '';
          return {
            media: {
              contentId: streamUrl,
              contentType: getAudioContentType(trackData.filePath),
              streamType: 'BUFFERED',
              supportedMediaCommands: 207,
              metadata: {
                type: 0,
                metadataType: 3,
                title: trackData.title || 'OpenFy',
                artist: trackData.artist || '',
                albumName: trackData.album || '',
                images: coverUrl ? [{ url: coverUrl }] : []
              }
            },
            autoplay: true,
            startTime: actionType === 'current' ? playbackState.currentTime : 0
          };
        };

        if (state.currentPlaybackState.hasPrev && state.currentPlaybackState.prevTrack) {
          queueItems.push(makeQueueItem(state.currentPlaybackState.prevTrack, 'prev'));
        }
        
        queueItems.push(makeQueueItem(state.currentPlaybackState, 'current'));

        if (state.currentPlaybackState.hasNext && state.currentPlaybackState.nextTrack) {
          queueItems.push(makeQueueItem(state.currentPlaybackState.nextTrack, 'next'));
        }

        const startIndex = state.currentPlaybackState.hasPrev ? 1 : 0;
        
        console.log(`[Cast] Loading queue of ${queueItems.length} items on Chromecast. startIndex: ${startIndex}`);
        state.castQueueItems = { prevId: null, currentId: null, nextId: null };

        state.activeCastPlayer.queueLoad(queueItems, { startIndex, currentTime: playbackState.currentTime, autoplay: true }, (err, status) => {
          if (err) {
            console.error('[Cast] queueLoad error, falling back to standard load:', err.message);
            const media = makeQueueItem(state.currentPlaybackState, 'current').media;
            state.activeCastPlayer.load(media, { autoplay: true, currentTime: playbackState.currentTime }, (err2) => {
              if (err2) console.error('[Cast] Fallback load error:', err2.message);
            });
          } else {
            console.log('[Cast] Queue loaded successfully on Chromecast');
          }
        });
      } catch (err) {
        console.warn('[Cast] Failed to load track/queue on Chromecast:', err.message);
      }
    } else {
      const castIsPlaying = state.lastKnownCastState.isPlaying;
      if (playbackState.isPlaying !== castIsPlaying) {
        if (playbackState.isPlaying) {
          console.log('[Cast] Playback resumed from app client -> Chromecast');
          state.activeCastPlayer.play((err) => {
            if (err) console.error('[Cast] play error:', err.message);
          });
        } else {
          console.log('[Cast] Playback paused from app client -> Chromecast');
          state.activeCastPlayer.pause((err) => {
            if (err) console.error('[Cast] pause error:', err.message);
          });
        }
      }

      const castTime = state.lastKnownCastState.currentTime || 0;
      const drift = Math.abs(playbackState.currentTime - castTime);
      if (drift > 2.5) {
        console.log(`[Cast] Seeking from app client -> Chromecast. Time: ${playbackState.currentTime} (drift: ${drift}s)`);
        state.activeCastPlayer.seek(playbackState.currentTime, (err) => {
          if (err) console.error('[Cast] seek error:', err.message);
        });
      }
    }
  }

  // Broadcast to all connected SSE clients
  const payload = JSON.stringify({ event: 'state', data: state.currentPlaybackState });
  state.sseClients.forEach(client => {
    client.write(`data: ${payload}\n\n`);
  });
}

function cleanup() {
  if (state.bonjourBrowser) {
    try { state.bonjourBrowser.stop(); } catch (_) {}
  }
  if (state.bonjourInstance) {
    try { state.bonjourInstance.destroy(); } catch (_) {}
  }
  if (castServer) {
    try { castServer.close(); } catch (_) {}
  }
  if (state.activeCastClient) {
    try { state.activeCastClient.close(); } catch (_) {}
  }
}

function getCastHtmlPage() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AirPlay & Google Cast - OpenFy</title>
  <style>
     body {
       margin: 0;
       padding: 0;
       background-color: #000000;
       color: #ffffff;
       font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
       height: 100vh;
       width: 100vw;
       overflow: hidden;
       position: relative;
     }
     .background-blur {
       position: absolute;
       top: 0; left: 0; right: 0; bottom: 0;
       background-size: cover;
       background-position: center;
       filter: blur(50px) brightness(0.3);
       transform: scale(1.1);
       z-index: 1;
       transition: background-image 0.5s ease-in-out;
     }
     .content-grid {
       position: relative;
       z-index: 2;
       display: grid;
       grid-template-columns: 45% 55%;
       height: 100vh;
       width: 100vw;
     }
     .left-panel {
       display: flex;
       flex-direction: column;
       align-items: center;
       justify-content: center;
       padding: 40px;
       border-right: 1px solid rgba(255, 255, 255, 0.08);
     }
     .cover-art {
       width: 380px;
       height: 380px;
       object-fit: cover;
       border-radius: 12px;
       box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
       margin-bottom: 32px;
       transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
       background-color: #282828;
     }
     .cover-art.playing {
       transform: scale(1.03);
     }
     .track-meta {
       text-align: center;
       max-width: 90%;
     }
     .track-title {
       font-size: 32px;
       font-weight: 800;
       margin-bottom: 8px;
       white-space: nowrap;
       overflow: hidden;
       text-overflow: ellipsis;
     }
     .track-artist {
       font-size: 20px;
       color: rgba(255, 255, 255, 0.65);
       margin-bottom: 32px;
     }
     .progress-bar-container {
       width: 80%;
       height: 6px;
       background-color: rgba(255, 255, 255, 0.2);
       border-radius: 3px;
       position: relative;
     }
     .progress-fill {
       height: 100%;
       background-color: #1db954;
       border-radius: 3px;
       width: 0%;
       transition: width 0.1s linear;
     }
     .right-panel {
       display: flex;
       flex-direction: column;
       justify-content: center;
       height: 100vh;
       overflow: hidden;
       padding: 0 60px;
       position: relative;
     }
     .lyrics-container {
       height: 80%;
       overflow: hidden;
       display: flex;
       flex-direction: column;
       gap: 24px;
       justify-content: flex-start;
       scroll-behavior: smooth;
       padding-top: 40vh;
       padding-bottom: 40vh;
     }
     .lyrics-line {
       font-size: 28px;
       font-weight: 700;
       color: rgba(255, 255, 255, 0.35);
       transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
       transform-origin: left center;
     }
     .lyrics-line.active {
       color: #ffffff;
       font-size: 38px;
       text-shadow: 0 8px 24px rgba(255, 255, 255, 0.3);
       transform: scale(1.02);
     }
     .no-lyrics {
       font-size: 24px;
       color: rgba(255, 255, 255, 0.5);
       text-align: center;
       width: 100%;
       margin-top: 40px;
     }
     @media (max-width: 900px) {
       .content-grid {
         grid-template-columns: 1fr;
         grid-template-rows: auto 1fr;
         overflow-y: auto;
       }
       .left-panel {
         border-right: none;
         border-bottom: 1px solid rgba(255, 255, 255, 0.08);
         padding: 30px 10px;
       }
       .cover-art {
         width: 200px;
         height: 200px;
       }
       .right-panel {
         height: auto;
         padding: 40px 20px;
       }
       .lyrics-container {
         padding-top: 10vh;
         padding-bottom: 20vh;
         height: auto;
       }
     }
  </style>
</head>
<body>
  <div class="background-blur" id="bg-blur"></div>
  <audio id="cast-audio" preload="auto"></audio>
  <div class="content-grid">
    <div class="left-panel">
      <img src="/cover" class="cover-art" id="cover" alt="Cover" />
      <div class="track-meta">
        <div class="track-title" id="title">Nenhuma música tocando</div>
        <div class="track-artist" id="artist">--</div>
      </div>
      <div class="progress-bar-container">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
    </div>
    <div class="right-panel">
      <div class="lyrics-container" id="lyrics-container">
        <div class="no-lyrics" id="no-lyrics">Sem letra sincronizada</div>
      </div>
    </div>
  </div>

  <script>
    const bgBlur = document.getElementById('bg-blur');
    const cover = document.getElementById('cover');
    const title = document.getElementById('title');
    const artist = document.getElementById('artist');
    const progressFill = document.getElementById('progress-fill');
    const lyricsContainer = document.getElementById('lyrics-container');
    const noLyrics = document.getElementById('no-lyrics');
    const castAudio = document.getElementById('cast-audio');

    const urlParams = new URLSearchParams(window.location.search);
    const enableAudio = urlParams.get('audio') === 'true';

    let currentLyrics = [];
    let lyricElements = [];
    let state = { duration: 0, currentTime: 0, isPlaying: false };

    let intervalId = null;
    function startProgressTimer() {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (state.isPlaying && state.duration > 0) {
          state.currentTime += 0.1;
          const pct = Math.min(100, (state.currentTime / state.duration) * 100);
          progressFill.style.width = pct + '%';
          updateLyricsHighlight(state.currentTime);
        }
      }, 100);
    }

    function updateLyricsHighlight(time) {
      if (currentLyrics.length === 0) return;
      let activeIndex = -1;
      for (let i = 0; i < currentLyrics.length; i++) {
        if (time >= currentLyrics[i].time) {
          activeIndex = i;
        } else {
          break;
        }
      }

      lyricElements.forEach((el, idx) => {
        if (idx === activeIndex) {
          if (!el.classList.contains('active')) {
            el.classList.add('active');
            const containerHeight = lyricsContainer.clientHeight;
            const elOffsetTop = el.offsetTop;
            const scrollAmount = elOffsetTop - (containerHeight / 2) + 20;
            lyricsContainer.scrollTo({ top: scrollAmount, behavior: 'smooth' });
          }
        } else {
          el.classList.remove('active');
        }
      });
    }

    document.body.addEventListener('click', () => {
      if (enableAudio && state.isPlaying && castAudio.paused) {
        castAudio.play().catch(err => console.log("Bypass play error:", err));
      }
    });

    const eventSource = new EventSource('/events');
    eventSource.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.event === 'state') {
        const data = payload.data;
        state.duration = data.duration;
        state.currentTime = data.currentTime;
        state.isPlaying = data.isPlaying;

        title.textContent = data.title || 'Nenhuma música tocando';
        artist.textContent = data.artist || '--';
        
        const coverUrl = '/cover?t=' + Date.now();
        cover.src = coverUrl;
        bgBlur.style.backgroundImage = 'url(' + coverUrl + ')';

        if (state.isPlaying) {
          cover.classList.add('playing');
        } else {
          cover.classList.remove('playing');
        }

        if (enableAudio && data.filePath) {
          if (castAudio.dataset.filePath !== data.filePath) {
            castAudio.dataset.filePath = data.filePath;
            castAudio.src = '/stream?t=' + Date.now();
            castAudio.load();
          }

          if (state.isPlaying) {
            if (castAudio.paused) {
              castAudio.play().catch(err => console.log("Play failed:", err));
            }
          } else {
            if (!castAudio.paused) {
              castAudio.pause();
            }
          }

          const diff = Math.abs(castAudio.currentTime - data.currentTime);
          if (diff > 1.5) {
            castAudio.currentTime = data.currentTime;
          }
        }

        if (JSON.stringify(currentLyrics) !== JSON.stringify(data.lyrics || [])) {
          currentLyrics = data.lyrics || [];
          lyricsContainer.innerHTML = '';
          lyricElements = [];
          
          if (currentLyrics.length > 0) {
            noLyrics.style.display = 'none';
            currentLyrics.forEach(line => {
              const el = document.createElement('div');
              el.className = 'lyrics-line';
              el.textContent = line.text;
              lyricsContainer.appendChild(el);
              lyricElements.push(el);
            });
          } else {
            lyricsContainer.appendChild(noLyrics);
            noLyrics.style.display = 'block';
          }
        }

        const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
        progressFill.style.width = pct + '%';
        updateLyricsHighlight(state.currentTime);

        startProgressTimer();
      }
    };
  </script>
</body>
</html>`;
}

module.exports = {
  startCastDiscovery,
  castToDevice,
  stopCasting,
  updateCastPlayback,
  cleanup,
  getLocalIpAddress,
  normalizeCastPlayerResponses
};
