const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const { dialog } = require('electron');
const state = require('../utils/state.cjs');

const FFMPEG_RELEASE = 'b6.1.1';
let dependenciesPromise = null;

function initPaths(userDataPath) {
  state.localBinDir = path.join(userDataPath, 'bin');
  state.localFfmpegPath = process.platform === 'win32' 
    ? path.join(state.localBinDir, 'ffmpeg.exe') 
    : path.join(state.localBinDir, 'ffmpeg');
  state.localFfprobePath = process.platform === 'win32' 
    ? path.join(state.localBinDir, 'ffprobe.exe') 
    : path.join(state.localBinDir, 'ffprobe');
  state.localYtdlpPath = process.platform === 'win32' 
    ? path.join(state.localBinDir, 'yt-dlp.exe') 
    : path.join(state.localBinDir, 'yt-dlp');
}

function getYtdlpExecutable() {
  if (state.localYtdlpPath && fs.existsSync(state.localYtdlpPath)) {
    return state.localYtdlpPath;
  }
  throw new Error('O binario privado do yt-dlp ainda nao esta disponivel. Reinicie o aplicativo conectado a internet.');
}

function getFfmpegExecutable() {
  if (state.localFfmpegPath && fs.existsSync(state.localFfmpegPath)) {
    return state.localFfmpegPath;
  }
  throw new Error('O binario privado do FFmpeg ainda nao esta disponivel. Reinicie o aplicativo conectado a internet.');
}

function isDependencyAvailable(cmd) {
  if (cmd === 'ffmpeg') {
    return Promise.resolve(Boolean(
      state.localFfmpegPath && fs.existsSync(state.localFfmpegPath) &&
      state.localFfprobePath && fs.existsSync(state.localFfprobePath)
    ));
  }
  if (cmd === 'yt-dlp') {
    return Promise.resolve(Boolean(state.localYtdlpPath && fs.existsSync(state.localYtdlpPath)));
  }
  return Promise.resolve(false);
}

function getBinaryDownloads(platform = process.platform, arch = process.arch) {
  const ffmpegArchitectures = {
    darwin: { x64: 'x64', arm64: 'arm64' },
    linux: { x64: 'x64', arm64: 'arm64', arm: 'armhf', ia32: 'ia32' },
    win32: { x64: 'x64', ia32: 'ia32' }
  };
  const ytDlpAssets = {
    darwin: { x64: 'yt-dlp_macos', arm64: 'yt-dlp_macos' },
    linux: { x64: 'yt-dlp_linux', arm64: 'yt-dlp_linux_aarch64' },
    win32: { x64: 'yt-dlp.exe', arm64: 'yt-dlp_arm64.exe', ia32: 'yt-dlp_x86.exe' }
  };
  const ffmpegArch = ffmpegArchitectures[platform]?.[arch];
  const ytDlpAsset = ytDlpAssets[platform]?.[arch];
  if (!ffmpegArch || !ytDlpAsset) {
    throw new Error(`Sistema nao suportado para download automatico: ${platform}/${arch}`);
  }
  const ffmpegPlatform = platform === 'win32' ? 'win32' : platform;
  const base = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}`;
  return {
    ytDlp: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytDlpAsset}`,
    ffmpeg: `${base}/ffmpeg-${ffmpegPlatform}-${ffmpegArch}.gz`,
    ffprobe: `${base}/ffprobe-${ffmpegPlatform}-${ffmpegArch}.gz`
  };
}

function downloadFile(url, dest, { gunzip = false } = {}) {
  return new Promise((resolve, reject) => {
    function get(requestUrl) {
      const parsedUrl = new URL(requestUrl);
      const httpModule = parsedUrl.protocol === 'https:' ? https : require('http');

      httpModule.get(requestUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume(); // consume response body to release socket
          let redirectUrl = response.headers.location;
          if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
            redirectUrl = new URL(redirectUrl, requestUrl).href;
          }
          get(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume(); // consume response body
          reject(new Error(`Failed to download: status ${response.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        const streams = gunzip ? [response, zlib.createGunzip(), file] : [response, file];
        pipeline(...streams).then(resolve, reject);
      }).on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }
    
    get(url);
  });
}

async function downloadBinary(url, destination, options) {
  const temporaryPath = `${destination}.download`;
  fs.rmSync(temporaryPath, { force: true });
  try {
    await downloadFile(url, temporaryPath, options);
    if (process.platform !== 'win32') fs.chmodSync(temporaryPath, 0o755);
    fs.renameSync(temporaryPath, destination);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

async function downloadDependencies(win, downloadFfmpeg, downloadYtdlp) {
  if (!fs.existsSync(state.localBinDir)) {
    fs.mkdirSync(state.localBinDir, { recursive: true });
  }

  if (win) dialog.showMessageBox(win, {
    type: 'info',
    title: 'Baixando Dependências',
    message: 'O download das dependências começou em segundo plano.',
    detail: 'Isso pode levar alguns minutos dependendo da sua conexão de internet. Você receberá um aviso assim que terminar.',
    buttons: ['OK']
  });

  try {
    const downloads = getBinaryDownloads();
    if (downloadYtdlp) {
      console.log('[Deps] Downloading yt-dlp...');
      await downloadBinary(downloads.ytDlp, state.localYtdlpPath);
      console.log('[Deps] yt-dlp downloaded successfully.');
    }

    if (downloadFfmpeg) {
      console.log('[Deps] Downloading FFmpeg...');
      await downloadBinary(downloads.ffmpeg, state.localFfmpegPath, { gunzip: true });
      await downloadBinary(downloads.ffprobe, state.localFfprobePath, { gunzip: true });
      console.log('[Deps] FFmpeg and FFprobe downloaded successfully.');
    }

    if (win) await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Sucesso',
      message: 'Os componentes do player foram preparados com sucesso!',
      detail: 'Os binários privados estão prontos. Nenhuma instalação no sistema foi feita.',
      buttons: ['OK']
    });

  } catch (err) {
    console.error('[Deps] Download failed:', err);
    if (win) await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Erro no Download',
      message: 'Não foi possível baixar as dependências automaticamente.',
      detail: `Erro: ${err.message}\n\nVerifique sua conexão e abra o aplicativo novamente. Nenhuma instalação manual é necessária.`,
      buttons: ['OK']
    });
    throw err;
  }
}

async function checkAndPromptDependencies(win) {
  if (dependenciesPromise) return dependenciesPromise;
  dependenciesPromise = ensureDependencies(win).catch((error) => {
    dependenciesPromise = null;
    throw error;
  });
  return dependenciesPromise;
}

async function ensureDependencies(win) {
  const hasFfmpeg = await isDependencyAvailable('ffmpeg');
  const hasYtdlp = await isDependencyAvailable('yt-dlp');

  if (hasFfmpeg && hasYtdlp) {
    console.log(`[Deps] Private binaries ready at ${state.localBinDir}.`);
    return;
  }

  const missing = [];
  if (!hasFfmpeg) missing.push('FFmpeg');
  if (!hasYtdlp) missing.push('yt-dlp');

  console.log(`[Deps] Missing dependencies: ${missing.join(', ')}`);

  await downloadDependencies(win, !hasFfmpeg, !hasYtdlp);
}

function runExecutable(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      maxBuffer: 1024 * 1024 * 10,
      windowsHide: true,
      timeout: options.timeout || 0
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

function runYtdlp(args, options) {
  return runExecutable(getYtdlpExecutable(), args, options);
}

function runFfmpeg(args, options) {
  return runExecutable(getFfmpegExecutable(), args, options);
}

function sanitizeFilename(name) {
  return name.replace(/[\\/*?:"<>|]/g, "");
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

// Clean track title and artist name of typical YouTube/music video clutter and separators
function parseVideoTitleAndArtist(title, artistName) {
  if (!title || typeof title !== 'string') {
    return { title: '', artist: artistName || 'Artista Desconhecido' };
  }
  
  // 1. Clean typical video suffixes first (parentheses, brackets, raw suffixes)
  let clean = title
    .replace(/\s*[([].*?(official|video|audio|lyrics|lyric|clip|hd|hq|music video|music|remastered|feat|ft|version|edit|prod|producer|produced|musiq|legendado|tradução|traducao|live|exclusivo|4k|1080p).*?[\])]/gi, '')
    .replace(/\s*(?:\/\/\s*|\/\s*|\\\s*|-\s*|\|\s*)(?:Official Music Video|Official Video|Official Audio|Lyric Video|Lyrics|Clip Oficial|Video Oficial|Audio Oficial|Legendado|Tradução|Traducao|Music Video|Music Video HD|Official Live Video|Live|Exclusive).*$/gi, '')
    .trim();

  let artist = artistName || 'Artista Desconhecido';
  let cleanArtist = artist.replace(/\s*-\s*Topic\s*/gi, '').replace(/\s*Official\s*$/gi, '').replace(/\s*Oficial\s*$/gi, '').trim();

  // 2. Check if there is a separator like "-", "–", "—", or "|"
  const parts = clean.split(/\s*(?:-|–|—|\|)\s*/);
  if (parts.length > 1) {
    const left = parts[0].trim();
    const right = parts.slice(1).join(' - ').trim();

    // Check if left side matches/overlaps cleanArtist
    const leftLower = left.toLowerCase();
    const artistLower = cleanArtist.toLowerCase();

    if (leftLower.includes(artistLower) || artistLower.includes(leftLower)) {
      // Left side is the artist, right side is the title
      artist = left;
      clean = right;
    } else if (right.toLowerCase().includes(artistLower) || artistLower.includes(right.toLowerCase())) {
      // Right side is the artist, left side is the title
      artist = right;
      clean = left;
    } else {
      // Check if one side is an artist list (commas, &, feat, ft, x)
      const rightLower = right.toLowerCase();
      const hasArtistListIndicators = right.includes(',') || right.includes('&') || rightLower.includes('feat') || rightLower.includes('ft') || rightLower.includes('x ');
      
      if (hasArtistListIndicators && !left.includes(',') && !left.includes('&')) {
        // Right side is probably artist list, left side is title
        artist = right;
        clean = left;
      } else {
        // Neither matches the channel name, but we have a hyphen. E.g. "Daniel Di Angelo - Ride for me" uploaded by "Mildred".
        // Usually, left side is the artist and right side is the song title.
        // Check if the left side is NOT a common subtitle/keyword like "Instrumental", "Karaoke", "Remix", "Cover", "Slowed", "Reverb", "Speed Up", "Live", "Acoustic".
        const commonSubtitles = ['instrumental', 'karaoke', 'remix', 'cover', 'slowed', 'reverb', 'speed up', 'live', 'acoustic', 'full album', 'album'];
        const isLeftSubtitle = commonSubtitles.some(sub => leftLower.includes(sub));
        const isRightSubtitle = commonSubtitles.some(sub => right.toLowerCase().includes(sub));

        if (!isLeftSubtitle) {
          // Assume left is artist, right is title
          artist = left;
          clean = right;
        } else if (!isRightSubtitle) {
          // If left is subtitle but right is not, maybe right is artist?
          artist = right;
          clean = left;
        }
      }
    }
  }

  // Remove surrounding quotes if any
  clean = clean.replace(/^["']|["']$/g, '').trim();
  artist = artist.replace(/^["']|["']$/g, '').trim();

  return {
    title: clean,
    artist: artist
  };
}

function cleanTrackTitle(title, artist) {
  const parsed = parseVideoTitleAndArtist(title, artist);
  return parsed.title;
}

function cleanArtistName(artist) {
  if (!artist || typeof artist !== 'string') return '';
  let clean = artist.replace(/\s*-\s*Topic\s*/gi, '').trim();
  clean = clean.replace(/\s*(feat\.?|ft\.?)\s+.*/gi, '').trim();
  const firstArtist = clean.split(/[&,]/)[0].trim();
  return firstArtist || clean;
}

function fetchLrcLyrics(title, artist, album, duration) {
  return new Promise(async (resolve) => {
    const cleanedTitle = cleanTrackTitle(title, artist);
    const cleanedArtist = cleanArtistName(artist);
    const cleanedAlbum = album ? album.replace(/\s*[([].*?(official|video|audio|lyrics|lyric|clip|hd|hq|music video|music|remastered|feat|ft|version|edit).*?[\])]/gi, '').trim() : '';

    console.log(`[Lyrics] Searching lyrics for: "${title}" by "${artist}". Cleaned: "${cleanedTitle}" by "${cleanedArtist}"`);

    // 1. First attempt: exact match using lrclib's get endpoint
    let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(cleanedArtist)}`;
    if (cleanedAlbum) getUrl += `&album_name=${encodeURIComponent(cleanedAlbum)}`;
    if (duration) getUrl += `&duration=${Math.round(duration)}`;

    const options = {
      headers: {
        'User-Agent': 'OpenFy/1.0 (https://github.com/antonioneris/cloneSpotfy)'
      }
    };

    const makeGetRequest = (url) => {
      return new Promise((resolveReq) => {
        https.get(url, options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try { resolveReq(JSON.parse(data)); } catch (_) { resolveReq(null); }
            } else {
              resolveReq(null);
            }
          });
        }).on('error', () => resolveReq(null));
      });
    };

    let result = await makeGetRequest(getUrl);
    if (result && (result.syncedLyrics || result.plainLyrics)) {
      console.log(`[Lyrics] Exact match found for "${cleanedTitle}"`);
      return resolve(result);
    }

    // Try without album if it was provided, since album name is often mismatched
    if (cleanedAlbum) {
      let getUrlNoAlbum = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(cleanedArtist)}`;
      if (duration) getUrlNoAlbum += `&duration=${Math.round(duration)}`;
      result = await makeGetRequest(getUrlNoAlbum);
      if (result && (result.syncedLyrics || result.plainLyrics)) {
        console.log(`[Lyrics] Match found without album name`);
        return resolve(result);
      }
    }

    // 2. Second attempt: search endpoint with q= query or field queries
    console.log(`[Lyrics] Exact match 404. Trying search fallback...`);
    const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(cleanedArtist)}`;
    https.get(searchUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const results = JSON.parse(data);
            if (Array.isArray(results) && results.length > 0) {
              let bestMatch = null;
              let bestDiff = Infinity;

              // Check for items with synced lyrics within duration limit
              for (const track of results) {
                if (track.syncedLyrics) {
                   const trackDuration = track.duration || 0;
                   const diff = Math.abs(trackDuration - (duration || 0));
                   if (diff < 15 && diff < bestDiff) {
                     bestMatch = track;
                     bestDiff = diff;
                   }
                }
              }

              // Fallback to plain lyrics within duration limit
              if (!bestMatch) {
                bestDiff = Infinity;
                for (const track of results) {
                  if (track.plainLyrics) {
                    const trackDuration = track.duration || 0;
                    const diff = Math.abs(trackDuration - (duration || 0));
                    if (diff < 15 && diff < bestDiff) {
                      bestMatch = track;
                      bestDiff = diff;
                    }
                  }
                }
              }

              // Fallback to any track with synced lyrics
              if (!bestMatch) {
                bestMatch = results.find(t => t.syncedLyrics);
              }

              // Fallback to first result
              if (!bestMatch) {
                bestMatch = results[0];
              }

              if (bestMatch) {
                console.log(`[Lyrics] Search match found: "${bestMatch.name}" by "${bestMatch.artistName}" (ID: ${bestMatch.id})`);
                return resolve(bestMatch);
              }
            }
          } catch (e) {
            console.error('[Lyrics] Error parsing search response:', e);
          }
        }
        resolve(null);
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

module.exports = {
  initPaths,
  getYtdlpExecutable,
  getFfmpegExecutable,
  getBinaryDownloads,
  isDependencyAvailable,
  downloadFile,
  downloadDependencies,
  checkAndPromptDependencies,
  runExecutable,
  runYtdlp,
  runFfmpeg,
  sanitizeFilename,
  downloadImage,
  parseVideoTitleAndArtist,
  cleanTrackTitle,
  cleanArtistName,
  fetchLrcLyrics
};
