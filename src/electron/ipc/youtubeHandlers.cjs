const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const https = require('https');
const YTMusic = require('ytmusic-api');

// --- Início da Sobrescrita Customizada para Correção da Paginação do YouTube Music ---
const ytHelpers = {
  traverse: (data, ...keys) => {
    const again = (data2, key, deadEnd = false) => {
      const res = [];
      if (data2 instanceof Object && key in data2) {
        res.push(data2[key]);
        if (deadEnd) return res.length === 1 ? res[0] : res;
      }
      if (data2 instanceof Array) {
        res.push(...data2.map((v) => again(v, key)).flat());
      } else if (data2 instanceof Object) {
        res.push(...Object.keys(data2).map((k) => again(data2[k], key)).flat());
      }
      return res.length === 1 ? res[0] : res;
    };
    let value = data;
    const lastKey = keys.at(-1);
    for (const key of keys) {
      value = again(value, key, lastKey === key);
    }
    return value;
  },
  traverseList: (data, ...keys) => {
    return [ytHelpers.traverse(data, ...keys)].flat();
  },
  traverseString: (data, ...keys) => {
    return ytHelpers.traverseList(data, ...keys).at(0) || "";
  },
  isTitle: (data) => {
    return ytHelpers.traverseString(data, "musicVideoType").startsWith("MUSIC_VIDEO_TYPE_");
  },
  isArtist: (data) => {
    return ["MUSIC_PAGE_TYPE_USER_CHANNEL", "MUSIC_PAGE_TYPE_ARTIST"].includes(
      ytHelpers.traverseString(data, "pageType")
    );
  },
  isDuration: (data) => {
    return ytHelpers.traverseString(data, "text").match(/(\d{1,2}:)?\d{1,2}:\d{1,2}/);
  },
  parseDuration: (time) => {
    if (!time) return null;
    const [seconds, minutes, hours] = time.split(":").reverse().map((n) => +n);
    return (seconds || 0) + (minutes || 0) * 60 + (hours || 0) * 60 * 60;
  },
  parsePlaylistVideo: (item) => {
    const flexColumns = ytHelpers.traverseList(item, "flexColumns", "runs").flat();
    const fixedcolumns = ytHelpers.traverseList(item, "fixedColumns", "runs").flat();
    const title = flexColumns.find(ytHelpers.isTitle) || flexColumns[0];
    const artist = flexColumns.find(ytHelpers.isArtist) || flexColumns[1];
    const duration = fixedcolumns.find(ytHelpers.isDuration);
    const videoId1 = ytHelpers.traverseString(item, "playNavigationEndpoint", "videoId");
    
    let videoId2 = null;
    const thumbs = ytHelpers.traverseList(item, "thumbnails");
    if (thumbs && thumbs[0] && thumbs[0].url) {
      const match = thumbs[0].url.match(/https:\/\/i\.ytimg\.com\/vi\/(.+)\//);
      if (match) videoId2 = match[1];
    }
    
    if (videoId1 == "" && videoId2 == null) {
      return undefined;
    }
    
    return {
      type: "VIDEO",
      videoId: videoId1 || videoId2,
      name: ytHelpers.traverseString(title, "text"),
      artist: {
        name: ytHelpers.traverseString(artist, "text"),
        artistId: ytHelpers.traverseString(artist, "browseId") || null
      },
      duration: ytHelpers.parseDuration(duration?.text || null),
      thumbnails: thumbs
    };
  },
  getPlaylistContinuationToken: (data) => {
    try {
      const shelf = data.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer;
      if (shelf && shelf.contents) {
        const lastItem = shelf.contents[shelf.contents.length - 1];
        if (lastItem && lastItem.continuationItemRenderer) {
          return lastItem.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
        }
      }
    } catch (e) {}

    try {
      const shelfCont = data.onResponseReceivedActions?.[0]?.appendContinuationItemsAction;
      if (shelfCont && shelfCont.continuationItems) {
        const lastItem = shelfCont.continuationItems[shelfCont.continuationItems.length - 1];
        if (lastItem && lastItem.continuationItemRenderer) {
          return lastItem.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
        }
      }
    } catch (e) {}
    
    return null;
  }
};

// Sobrescreve getPlaylistVideos no protótipo de YTMusic para corrigir paginação limitada e Bad Requests (400)
YTMusic.prototype.getPlaylistVideos = async function(playlistId) {
  if (playlistId.startsWith("PL")) playlistId = "VL" + playlistId;
  
  const playlistData = await this.constructRequest("browse", {
    browseId: playlistId
  });

  const songs = [];
  
  // Extrai as músicas da página inicial
  const shelf = playlistData.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer;
  if (shelf && shelf.contents) {
    for (const item of shelf.contents) {
      if (item.musicResponsiveListItemRenderer) {
        songs.push(item);
      }
    }
  }

  let continuation = ytHelpers.getPlaylistContinuationToken(playlistData);

  while (continuation) {
    try {
      const songsData = await this.constructRequest("browse", {}, { continuation });
      
      const appendAction = songsData.onResponseReceivedActions?.[0]?.appendContinuationItemsAction;
      if (appendAction && appendAction.continuationItems) {
        for (const item of appendAction.continuationItems) {
          if (item.musicResponsiveListItemRenderer) {
            songs.push(item);
          }
        }
      }
      
      continuation = ytHelpers.getPlaylistContinuationToken(songsData);
    } catch (err) {
      console.error('[YTMusic Custom] Continuation request failed:', err.message);
      break;
    }
  }

  return songs.map(ytHelpers.parsePlaylistVideo).filter((video) => video !== undefined);
};
// --- Fim da Sobrescrita Customizada ---

const spotifyUrlInfo = require('spotify-url-info');
const customFetch = (url, options = {}) => {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...options.headers
  };
  return fetch(url, { ...options, headers });
};
const { getData } = spotifyUrlInfo(customFetch);

const state = require('../utils/state.cjs');
const {
  getFfmpegExecutable,
  runYtdlp,
  runFfmpeg,
  downloadImage,
  sanitizeFilename,
  parseVideoTitleAndArtist,
  cleanTrackTitle,
  cleanArtistName,
  fetchLrcLyrics
} = require('../services/ytdlpService.cjs');
const {
  assertPathAllowed,
  assertTrustedSender,
  requireHttpUrl,
  requireString
} = require('../utils/ipcSecurity.cjs');

const ytmusic = new YTMusic();
let ytInitialized = false;

async function ensureYTMusicInit() {
  if (!ytInitialized) {
    await ytmusic.initialize();
    ytInitialized = true;
  }
}

function requireVideoId(value) {
  requireString(value, 'ID do vídeo', 32);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError('ID do vídeo inválido.');
  return value;
}

// Helper to fetch playlist tracks using yt-dlp (more reliable for large playlists)
async function getPlaylistTracksWithYtDlp(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  
  try {
    const output = await runYtdlp(['--flat-playlist', '--dump-single-json', url]);
    const data = JSON.parse(output);
    if (!data || !data.entries) return null;
    
    return data.entries.map(entry => {
      const thumbnails = Array.isArray(entry.thumbnails) 
        ? entry.thumbnails.map(t => ({ url: t.url, width: t.width || 0, height: t.height || 0 }))
        : [];

      const artistName = entry.uploader || entry.artist || 'Artista Desconhecido';
      const parsed = parseVideoTitleAndArtist(entry.title, artistName);

      return {
        type: 'VIDEO',
        videoId: entry.id,
        name: parsed.title,
        artist: {
          name: parsed.artist,
          artistId: entry.channel_id || null
        },
        duration: entry.duration || 0,
        thumbnails: thumbnails
      };
    });
  } catch (err) {
    console.error('[YtDlp] Failed to fetch playlist tracks:', err.message);
    return null;
  }
}

// Helper to resolve metadata for playlist videos in batches
async function resolvePlaylistVideosMetadata(videos) {
  if (!videos || videos.length === 0) return [];

  const resolved = [];
  const videosToProcess = videos;
  const chunkSize = 15;
  const albumCache = new Map();

  for (let i = 0; i < videosToProcess.length; i += chunkSize) {
    const chunk = videosToProcess.slice(i, i + chunkSize);
    const chunkPromises = chunk.map(async (song) => {
      try {
        const query = `${song.name} ${song.artist?.name || ''}`.trim();
        const results = await ytmusic.searchSongs(query);
        const match = results.find(item => item.videoId === song.videoId) || results[0];
        if (match) {
          let albumYear = null;
          if (match.album && match.album.albumId) {
            try {
              if (albumCache.has(match.album.albumId)) {
                albumYear = albumCache.get(match.album.albumId);
              } else {
                const albumData = await ytmusic.getAlbum(match.album.albumId);
                albumYear = albumData?.year || null;
                albumCache.set(match.album.albumId, albumYear);
              }
            } catch (albumErr) {
              // Ignore
            }
          }
          const parsed = parseVideoTitleAndArtist(match.name || song.name, match.artist?.name || song.artist?.name);
          return {
            ...song,
            name: parsed.title,
            artist: {
              name: parsed.artist,
              artistId: match.artist?.artistId || song.artist.artistId
            },
            album: match.album ? { name: match.album.name, albumId: match.album.albumId } : null,
            thumbnails: match.thumbnails && match.thumbnails.length > 0 ? match.thumbnails : song.thumbnails,
            year: albumYear
          };
        }
      } catch (err) {
        // Ignore resolution error and return original
      }
      return {
        ...song,
        album: null,
        year: null
      };
    });
    const chunkResults = await Promise.all(chunkPromises);
    resolved.push(...chunkResults);
  }

  return resolved;
}
function parseSpotifyUrl(url) {
  let type = null;
  let id = null;
  
  if (url.includes('spotify:')) {
    const parts = url.split(':');
    type = parts[1];
    id = parts[2]?.split('?')[0];
  } else {
    const match = url.match(/\/(playlist|track|album)\/([a-zA-Z0-9]+)/);
    if (match) {
      type = match[1];
      id = match[2];
    }
  }
  return { type, id };
}

async function getAccessToken(clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!res.ok) {
    throw new Error(`Spotify Auth failed: ${res.status} ${await res.text()}`);
  }
  
  const data = await res.json();
  return data.access_token;
}

function mapTrack(t, coverUrl, idx) {
  let artistName = 'Artista Desconhecido';
  if (t.artists && t.artists.length > 0) {
    artistName = t.artists.map(a => a.name).join(' & ');
  }

  return {
    type: 'SONG',
    videoId: `spotify-${t.uri || idx}`,
    name: t.name,
    artist: {
      name: artistName,
      artistId: null
    },
    album: t.album?.name ? { name: t.album.name, albumId: null } : null,
    duration: t.duration_ms ? Math.floor(t.duration_ms / 1000) : 0,
    thumbnails: coverUrl ? [{ url: coverUrl, width: 640, height: 640 }] : []
  };
}

async function resolveSpotifyUrlWithApi(url, clientId, clientSecret) {
  const { type, id } = parseSpotifyUrl(url);
  if (!type || !id) {
    throw new Error('Invalid Spotify URL or URI');
  }

  const token = await getAccessToken(clientId, clientSecret);
  const headers = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  if (type === 'track') {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, { headers });
    if (!res.ok) throw new Error(`Fetch track failed: ${res.status}`);
    const trackData = await res.json();
    const coverUrl = trackData.album?.images?.[0]?.url || '';
    return {
      id: url,
      type: 'SONG',
      name: trackData.name,
      artist: trackData.artists?.[0]?.name || 'Artista Desconhecido',
      coverUrl,
      tracks: [mapTrack(trackData, coverUrl, 0)]
    };
  }

  if (type === 'album') {
    const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, { headers });
    if (!res.ok) throw new Error(`Fetch album failed: ${res.status}`);
    const albumData = await res.json();
    const coverUrl = albumData.images?.[0]?.url || '';
    
    let items = albumData.tracks?.items || [];
    let nextUrl = albumData.tracks?.next;
    
    while (nextUrl) {
      const pageRes = await fetch(nextUrl, { headers });
      if (!pageRes.ok) throw new Error(`Fetch album tracks page failed: ${pageRes.status}`);
      const pageData = await pageRes.json();
      items = items.concat(pageData.items || []);
      nextUrl = pageData.next;
    }

    const tracks = items.map((item, idx) => mapTrack({ ...item, album: albumData }, coverUrl, idx));
    return {
      id: url,
      type: 'PLAYLIST',
      name: albumData.name,
      artist: albumData.artists?.[0]?.name || 'Spotify',
      coverUrl,
      tracks
    };
  }

  if (type === 'playlist') {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${id}`, { headers });
    if (!res.ok) throw new Error(`Fetch playlist failed: ${res.status}`);
    const playlistData = await res.json();
    const coverUrl = playlistData.images?.[0]?.url || '';
    
    let items = playlistData.tracks?.items || [];
    let nextUrl = playlistData.tracks?.next;
    
    while (nextUrl) {
      const pageRes = await fetch(nextUrl, { headers });
      if (!pageRes.ok) throw new Error(`Fetch playlist tracks page failed: ${pageRes.status}`);
      const pageData = await pageRes.json();
      items = items.concat(pageData.items || []);
      nextUrl = pageData.next;
    }

    const tracks = items.map((item, idx) => {
      const t = item.track;
      if (!t) return null;
      const tCover = t.album?.images?.[0]?.url || coverUrl;
      return mapTrack(t, tCover, idx);
    }).filter(Boolean);

    return {
      id: url,
      type: 'PLAYLIST',
      name: playlistData.name,
      artist: 'Spotify',
      coverUrl,
      tracks
    };
  }
}

async function verifyAndConvertTempAudio(videoId) {
  const tempDir = app.getPath('temp');
  const expectedM4aPath = path.join(tempDir, `temp_audio_${videoId}.m4a`);

  if (fs.existsSync(expectedM4aPath)) {
    try {
      const stats = fs.statSync(expectedM4aPath);
      if (stats.size > 0) {
        console.log(`[Temp Audio Verification] Found expected M4a file: ${expectedM4aPath} (${stats.size} bytes)`);
        return expectedM4aPath;
      } else {
        console.warn(`[Temp Audio Verification] Expected M4a file is empty (0 bytes). Removing and scanning alternatives.`);
        try { fs.unlinkSync(expectedM4aPath); } catch (_) {}
      }
    } catch (statErr) {
      console.warn(`[Temp Audio Verification] Stat failed on ${expectedM4aPath}, trying alternatives:`, statErr.message);
    }
  }

  console.log(`[Temp Audio Verification] Expected M4a file not found: ${expectedM4aPath}. Scanning for alternative audio files...`);
  
  let files;
  try {
    files = await fs.promises.readdir(tempDir);
  } catch (dirErr) {
    console.error(`[Temp Audio Verification] Failed to read temp directory:`, dirErr.message);
    throw new Error(`Falha ao ler diretório temporário: ${dirErr.message}`);
  }

  const prefix = `temp_audio_${videoId}.`;
  const audioExtensions = ['.webm', '.opus', '.aac', '.ogg', '.mka', '.wav', '.mp3'];
  let foundFile = null;
  let foundExt = '';

  for (const file of files) {
    if (file.startsWith(prefix)) {
      const ext = path.extname(file).toLowerCase();
      if (audioExtensions.includes(ext)) {
        foundFile = path.join(tempDir, file);
        foundExt = ext;
        break;
      }
    }
  }

  if (!foundFile) {
    throw new Error(`Nenhum arquivo de áudio temporário correspondente foi encontrado para o vídeo ${videoId}.`);
  }

  console.log(`[Temp Audio Verification] Found alternative file: ${foundFile}. Converting to M4a using ffmpeg...`);
  try {
    await runFfmpeg(['-y', '-i', foundFile, '-c:a', 'aac', '-b:a', '192k', '-vn', expectedM4aPath]);

    console.log(`[Temp Audio Verification] Successfully converted ${foundExt} to M4a: ${expectedM4aPath}`);
    
    try {
      fs.unlinkSync(foundFile);
    } catch (unlinkErr) {
      console.warn(`[Temp Audio Verification] Warning: Failed to delete source file ${foundFile}:`, unlinkErr.message);
    }

    return expectedM4aPath;
  } catch (convErr) {
    console.error(`[Temp Audio Verification] FFmpeg conversion failed for file ${foundFile}:`, convErr.message);
    throw new Error(`Falha ao converter arquivo temporário de áudio (${foundExt}) para M4a: ${convErr.message}`);
  }
}

function registerYoutubeHandlers() {
  const secureHandle = (channel, handler) => ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  });
  // IPC handler for searching YouTube Music
  secureHandle('yt-search', async (event, query) => {
    try {
      requireString(query, 'Busca', 500);
      await ensureYTMusicInit();
      const [songs, artists, albums, playlists] = await Promise.all([
        ytmusic.searchSongs(query).catch(err => { console.error('Search songs error:', err); return []; }),
        ytmusic.searchArtists(query).catch(err => { console.error('Search artists error:', err); return []; }),
        ytmusic.searchAlbums(query).catch(err => { console.error('Search albums error:', err); return []; }),
        ytmusic.searchPlaylists(query).catch(err => { console.error('Search playlists error:', err); return []; })
      ]);
      return {
        songs: songs || [],
        artists: artists || [],
        albums: albums || [],
        playlists: playlists || []
      };
    } catch (err) {
      console.error('Failed to search YouTube Music:', err);
      throw err;
    }
  });

  // IPC handler for retrieving remote artist details
  secureHandle('yt-get-artist-details', async (event, artistId) => {
    try {
      await ensureYTMusicInit();
      const [artist, songs] = await Promise.all([
        ytmusic.getArtist(artistId),
        ytmusic.getArtistSongs(artistId).catch(err => { console.error('Get artist songs error:', err); return []; })
      ]);
      return {
        artist: artist,
        songs: songs || artist.topSongs || [],
        albums: artist.topAlbums || [],
        singles: artist.topSingles || []
      };
    } catch (err) {
      console.error('Failed to get remote artist details:', err);
      throw err;
    }
  });

  // IPC handler for retrieving remote album details
  secureHandle('yt-get-album-tracks', async (event, albumId) => {
    try {
      await ensureYTMusicInit();
      return await ytmusic.getAlbum(albumId);
    } catch (err) {
      console.error('Failed to get remote album tracks:', err);
      throw err;
    }
  });

  // IPC handler for resolving Spotify URLs
  secureHandle('resolve-spotify-url', async (event, url, credentials) => {
    try {
      const spotifyUrl = new URL(requireHttpUrl(url, 'URL do Spotify'));
      if (!/(^|\.)spotify\.com$/i.test(spotifyUrl.hostname)) throw new TypeError('URL do Spotify inválida.');
      url = spotifyUrl.href;
      let data = null;
      let limitExceeded = false;
      let usingApi = false;

      if (credentials && credentials.clientId && credentials.clientSecret) {
        try {
          console.log(`[Spotify] Resolving URL via official API...`);
          const result = await resolveSpotifyUrlWithApi(url, credentials.clientId, credentials.clientSecret);
          if (result) {
            data = result;
            usingApi = true;
          }
        } catch (apiErr) {
          console.warn(`[Spotify] Official API resolution failed, falling back to scraping:`, apiErr.message);
        }
      }

      if (!usingApi) {
        console.log(`[Spotify] Resolving URL via scraping fallback...`);
        const scraped = await getData(url);
        if (!scraped) {
          return null;
        }

        const type = scraped.type === 'track' ? 'SONG' : 'PLAYLIST';
        const name = scraped.name || 'Spotify Import';
        
        const images = scraped.coverArt?.sources || scraped.images || scraped.visualIdentity?.image;
        const coverUrl = images && images.length > 0 
          ? images.reduce((a, b) => ((a.width || 0) > (b.width || 0) ? a : b))?.url 
          : '';

        let playlistArtist = 'Spotify';
        if (scraped.type === 'track' && scraped.artists && scraped.artists.length > 0) {
          playlistArtist = scraped.artists[0].name;
        } else if (scraped.type === 'album' && scraped.artists && scraped.artists.length > 0) {
          playlistArtist = scraped.artists[0].name;
        }

        const rawTracks = scraped.trackList ? scraped.trackList : [scraped];

        if (scraped.type === 'playlist' && scraped.trackList && scraped.trackList.length >= 100) {
          limitExceeded = true;
        }

        const tracks = rawTracks.map((t, idx) => {
          let artistName = playlistArtist || 'Artista Desconhecido';
          if (t.artists && t.artists.length > 0) {
            artistName = t.artists.map(a => a.name).join(' & ');
          } else if (t.subtitle) {
            artistName = t.subtitle;
          }

          let albumName = null;
          if (t.album && t.album.name) {
            albumName = t.album.name;
          } else if (scraped.type === 'album') {
            albumName = scraped.name;
          }

          return {
            type: 'SONG',
            videoId: `spotify-${t.uri || idx}`,
            name: t.title || t.name,
            artist: {
              name: artistName,
              artistId: null
            },
            album: albumName ? { name: albumName, albumId: null } : null,
            duration: t.duration ? Math.floor(t.duration / 1000) : 0,
            thumbnails: coverUrl ? [{ url: coverUrl, width: 640, height: 640 }] : []
          };
        });

        data = {
          id: url,
          type,
          name,
          coverUrl,
          artist: playlistArtist,
          tracks
        };
      }

      // Upgrade cover URL if possible (only if we resolved some tracks and didn't use the API)
      if (data.tracks && data.tracks.length > 0 && !usingApi) {
        let hiResCover = data.coverUrl;
        let ytmusicCoverUrl;
        const firstTrack = data.tracks[0];
        const searchQuery = `${firstTrack.name} ${firstTrack.artist?.name || ''}`.trim();
        if (searchQuery) {
          try {
            await ensureYTMusicInit();
            const searchResults = await ytmusic.searchSongs(searchQuery);
            if (searchResults && searchResults.length > 0 && searchResults[0].thumbnails?.length > 0) {
              const bestThumb = searchResults[0].thumbnails[searchResults[0].thumbnails.length - 1];
              if (bestThumb.url && (bestThumb.width || 0) >= 800) {
                hiResCover = bestThumb.url;
                ytmusicCoverUrl = bestThumb.url;
                console.log(`[Spotify] Upgraded playlist cover to ${bestThumb.width}x${bestThumb.height}`);
              }
            }
          } catch (e) {
            console.warn('[Spotify] Could not fetch hi-res cover from YTMusic:', e.message);
          }
        }

        if (ytmusicCoverUrl) {
          data.tracks.forEach(t => {
            if (t.thumbnails && t.thumbnails.length > 0) {
              t.thumbnails = [{ url: ytmusicCoverUrl, width: 1200, height: 1200 }];
            }
          });
          data.coverUrl = hiResCover;
        }
      }

      return {
        ...data,
        limitExceeded,
        usingApi
      };
    } catch (err) {
      console.error('Failed to resolve Spotify URL:', err);
      return null;
    }
  });

  // IPC handler for retrieving remote playlist tracks
  secureHandle('yt-get-playlist-tracks', async (event, playlistId) => {
    try {
      await ensureYTMusicInit();
      
      let videos = null;
      
      try {
        console.log(`[Playlist] Fetching tracks for ${playlistId} via ytmusic-api...`);
        const rawVideos = await ytmusic.getPlaylistVideos(playlistId);
        if (rawVideos && rawVideos.length > 0) {
          videos = rawVideos.map(v => {
            const parsed = parseVideoTitleAndArtist(v.name, v.artist?.name);
            return {
              ...v,
              name: parsed.title,
              artist: {
                ...v.artist,
                name: parsed.artist
              }
            };
          });
        }
      } catch (ytApiErr) {
        console.warn(`[Playlist] Fetch via ytmusic-api failed, falling back to yt-dlp:`, ytApiErr.message);
      }
      
      if (!videos || videos.length === 0) {
        console.log(`[Playlist] Fetching tracks for ${playlistId} via yt-dlp fallback...`);
        videos = await getPlaylistTracksWithYtDlp(playlistId);
      }
      
      if (!videos) return [];
      
      console.log(`[Playlist] Found ${videos.length} videos. Resolving metadata...`);
      return await resolvePlaylistVideosMetadata(videos);
    } catch (err) {
      console.error('Failed to get remote playlist tracks:', err);
      throw err;
    }
  });

  // IPC handler for retrieving remote playlist details (metadata)
  secureHandle('yt-get-playlist-details', async (event, playlistId) => {
    try {
      await ensureYTMusicInit();
      return await ytmusic.getPlaylist(playlistId);
    } catch (err) {
      console.error('Failed to get remote playlist details:', err);
      throw err;
    }
  });

  // IPC handler for autocomplete suggestions and artist extraction
  secureHandle('yt-search-autocomplete', async (event, query) => {
    try {
      await ensureYTMusicInit();
      const [suggestions, searchResults] = await Promise.all([
        ytmusic.getSearchSuggestions(query).catch(() => []),
        ytmusic.search(query).catch(() => [])
      ]);

      const artistMap = new Map();

      for (const item of searchResults) {
        if (item.type === 'ARTIST' && item.name) {
          artistMap.set(item.name.toLowerCase(), {
            name: item.name,
            artistId: item.artistId || null,
            thumbnails: item.thumbnails || []
          });
        } else if (item.type === 'SONG' && item.artist && item.artist.name) {
          const artistName = item.artist.name;
          if (!artistMap.has(artistName.toLowerCase())) {
            artistMap.set(artistName.toLowerCase(), {
              name: artistName,
              artistId: item.artist.artistId || null,
              thumbnails: item.thumbnails || []
            });
          }
        }
      }

      const artists = Array.from(artistMap.values()).slice(0, 5);

      return {
        suggestions: suggestions.slice(0, 5),
        artists
      };
    } catch (err) {
      console.error('Failed to get autocomplete suggestions:', err);
      return { suggestions: [], artists: [] };
    }
  });

  // IPC handler for downloading songs from YouTube Music with cover art, metadata and lyrics
  secureHandle('yt-download', async (event, { id, title, artist, album, coverUrl, duration, downloadDir, genre, year, skipMetadataFetch }) => {
    requireVideoId(id);
    downloadDir = assertPathAllowed(downloadDir);
    if (coverUrl) coverUrl = requireHttpUrl(coverUrl, 'URL da capa');
    let resolvedId = id;
    
    const parsed = parseVideoTitleAndArtist(title, artist);
    const cleanTitleStr = parsed.title;
    const cleanArtistStr = parsed.artist;
    
    if (resolvedId.startsWith('spotify-')) {
      console.log(`[Download] Resolving Spotify track: "${title}" by "${artist}"...`);
      try {
        await ensureYTMusicInit();
        const results = await ytmusic.searchSongs(`${title} ${artist}`);
        if (results && results.length > 0) {
          resolvedId = results[0].videoId;
          console.log(`[Download] Resolved Spotify track to YouTube ID: ${resolvedId}`);
          if (results[0].thumbnails && results[0].thumbnails.length > 0) {
            coverUrl = results[0].thumbnails[results[0].thumbnails.length - 1].url;
            console.log(`[Download] Resolved Spotify track cover to YTMusic cover: ${coverUrl}`);
          }
        } else {
          throw new Error('No YouTube match found for Spotify track.');
        }
      } catch (err) {
        console.error('[Download] Failed to resolve Spotify track for download:', err.message);
        return { success: false, error: err.message };
      }
    }

    const tempAudioPath = path.join(app.getPath('temp'), `temp_audio_${resolvedId}.m4a`);
    const coverPath = path.join(app.getPath('temp'), `cover_${resolvedId}.jpg`);

    try {
      const artistDir = path.join(downloadDir, sanitizeFilename(cleanArtistStr));
      const albumDir = path.join(artistDir, sanitizeFilename(album || 'Singles'));
      await fs.promises.mkdir(albumDir, { recursive: true });

      const cleanTitle = sanitizeFilename(cleanTitleStr);
      const finalFilePath = path.join(albumDir, `${cleanTitle} [${resolvedId}].m4a`);
      const finalLrcPath = path.join(albumDir, `${cleanTitle} [${resolvedId}].lrc`);

      let resolvedGenre = genre || '';
      let resolvedYear = year || null;
      let resolvedDate = '';
      
      if (!skipMetadataFetch && (!resolvedGenre || !resolvedYear)) {
        try {
          const metaJson = await runYtdlp([
            `https://www.youtube.com/watch?v=${resolvedId}`,
            '--dump-json',
            '--no-download'
          ]);
          const meta = JSON.parse(metaJson);
          if (!resolvedGenre && meta.genre) {
            resolvedGenre = meta.genre;
          }
          if (!resolvedGenre && meta.categories && meta.categories.length > 0) {
            resolvedGenre = meta.categories[0] === 'Music' && meta.tags && meta.tags.length > 0
              ? meta.tags[0]
              : meta.categories[0];
          }
          if (!resolvedYear && meta.upload_date) {
            resolvedYear = parseInt(meta.upload_date.substring(0, 4), 10) || null;
            resolvedDate = meta.upload_date;
          }
          if (!resolvedYear && meta.release_year) {
            resolvedYear = meta.release_year;
          }
        } catch (metaErr) {
          console.warn('[Download] Failed to fetch yt-dlp metadata JSON, continuing with provided data:', metaErr.message);
        }
      }

      const ytdlpArgs = [
        `https://www.youtube.com/watch?v=${resolvedId}`,
        '-f', 'bestaudio/best', '-x', '--audio-format', 'm4a',
        '-o', tempAudioPath.replace('.m4a', '.%(ext)s')
      ];
      try {
        await runYtdlp(ytdlpArgs);
      } catch (err) {
        console.warn('[Download] Initial download attempt failed:', err.message);
        if ((err.message.includes('403') || err.message.includes('Forbidden') || err.message.includes('SABR')) && state.localYtdlpPath && fs.existsSync(state.localYtdlpPath)) {
          console.log('[Download] Outdated yt-dlp suspected. Attempting automatic self-update...');
          try {
            await runYtdlp(['-U']);
            console.log('[Download] Self-update complete. Retrying download...');
            await runYtdlp(ytdlpArgs);
          } catch (updateErr) {
            console.error('[Download] Self-update retry failed:', updateErr.message);
            throw err;
          }
        } else {
          throw err;
        }
      }

      const verifiedAudioPath = await verifyAndConvertTempAudio(resolvedId);

      let hasCover = false;
      if (coverUrl) {
        try {
          await downloadImage(coverUrl, coverPath);
          hasCover = true;
        } catch (imgErr) {
          console.warn('Failed to download cover art, skipping cover embed:', imgErr);
        }
      }

      const metadataTitle = cleanTitleStr;
      const metadataArtist = cleanArtistStr;
      const metadataAlbum = album || 'Singles';
      const metadataGenre = resolvedGenre || '';
      const metadataYear = resolvedYear ? String(resolvedYear) : '';
      const metadataDate = resolvedDate || '';

      const metadataArgs = [
        '-metadata', `title=${metadataTitle}`,
        '-metadata', `artist=${metadataArtist}`,
        '-metadata', `album=${metadataAlbum}`
      ];
      if (metadataGenre) metadataArgs.push('-metadata', `genre=${metadataGenre}`);
      if (metadataYear) metadataArgs.push('-metadata', `date=${metadataYear}`);
      if (metadataDate) metadataArgs.push('-metadata', `creation_time=${metadataDate}`);

      let ffmpegArgs;
      if (hasCover && fs.existsSync(coverPath)) {
        ffmpegArgs = ['-y', '-i', verifiedAudioPath, '-i', coverPath, '-map', '0:a', '-map', '1:v', '-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', ...metadataArgs, finalFilePath];
      } else {
        ffmpegArgs = ['-y', '-i', verifiedAudioPath, '-c:a', 'copy', ...metadataArgs, finalFilePath];
      }
      await runFfmpeg(ffmpegArgs);

      let lrcContent = '';
      try {
        const lyricsData = await fetchLrcLyrics(title, artist, album, duration);
        if (lyricsData) {
          if (lyricsData.syncedLyrics) {
            lrcContent = lyricsData.syncedLyrics;
            await fs.promises.writeFile(finalLrcPath, lyricsData.syncedLyrics, 'utf8');
          } else if (lyricsData.plainLyrics) {
            lrcContent = lyricsData.plainLyrics;
            await fs.promises.writeFile(finalLrcPath, lyricsData.plainLyrics, 'utf8');
          }
        }
      } catch (lrcErr) {
        console.warn('Failed to fetch/save lyrics:', lrcErr);
      }

      if (fs.existsSync(verifiedAudioPath)) fs.unlinkSync(verifiedAudioPath);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);

      return { 
        status: 'success', 
        filepath: finalFilePath,
        lrcContent: lrcContent || undefined,
        hasLrc: !!lrcContent
      };
    } catch (err) {
      console.error('Failed to download song:', err);
      if (fs.existsSync(tempAudioPath)) try { fs.unlinkSync(tempAudioPath); } catch (_) {}
      const m4aExpected = path.join(app.getPath('temp'), `temp_audio_${resolvedId}.m4a`);
      if (fs.existsSync(m4aExpected)) try { fs.unlinkSync(m4aExpected); } catch (_) {}
      if (fs.existsSync(coverPath)) try { fs.unlinkSync(coverPath); } catch (_) {}
      throw err;
    }
  });

  // Staged download handlers
  secureHandle('yt-resolve-id', async (event, { id, title, artist }) => {
    requireVideoId(id);
    requireString(title, 'Título', 1000);
    requireString(artist, 'Artista', 1000);
    if (!id.startsWith('spotify-')) {
      return { videoId: id };
    }
    try {
      await ensureYTMusicInit();
      const results = await ytmusic.searchSongs(`${title} ${artist}`);
      if (results && results.length > 0) {
        const match = results[0];
        let coverUrl = '';
        if (match.thumbnails && match.thumbnails.length > 0) {
          coverUrl = match.thumbnails[match.thumbnails.length - 1].url;
        }
        return {
          videoId: match.videoId,
          coverUrl: coverUrl || undefined,
          albumName: match.album?.name || undefined
        };
      }
      throw new Error('No YouTube match found.');
    } catch (err) {
      console.error('[Resolve] Failed to resolve:', err.message);
      throw err;
    }
  });

  secureHandle('yt-download-temp-audio', async (event, { videoId }) => {
    requireVideoId(videoId);
    const tempAudioPath = path.join(app.getPath('temp'), `temp_audio_${videoId}.m4a`);
    const hasLocalFfmpeg = state.localFfmpegPath && fs.existsSync(state.localFfmpegPath);
    const hasLocalFfprobe = state.localFfprobePath && fs.existsSync(state.localFfprobePath);
    const ytdlpArgs = [`https://www.youtube.com/watch?v=${videoId}`];
    if (hasLocalFfmpeg && hasLocalFfprobe) {
      ytdlpArgs.push('--ffmpeg-location', state.localBinDir);
    }
    ytdlpArgs.push(
      '-f', 'bestaudio/best', '-x', '--audio-format', 'm4a',
      '-o', tempAudioPath.replace('.m4a', '.%(ext)s')
    );
    
    try {
      await runYtdlp(ytdlpArgs);
      const verifiedPath = await verifyAndConvertTempAudio(videoId);
      return verifiedPath;
    } catch (err) {
      console.warn('[Download Temp] Initial download attempt failed:', err.message);
      
      if (err.message.includes('429') || err.message.includes('confirm you’re not a bot') || err.message.includes('Sign in') || err.message.includes('Too Many Requests')) {
        console.log('[Download Temp] Bot block/limit detected. Attempting retry with browser cookies...');
        
        const browsers = process.platform === 'darwin' ? ['safari', 'chrome', 'firefox'] : ['chrome', 'firefox', 'edge'];
        for (const browser of browsers) {
          try {
            console.log(`[Download Temp] Retrying with cookies from ${browser}...`);
            await runYtdlp([...ytdlpArgs, '--cookies-from-browser', browser]);
            const verifiedPath = await verifyAndConvertTempAudio(videoId);
            return verifiedPath;
          } catch (cookieErr) {
            console.warn(`[Download Temp] Retry with ${browser} cookies failed:`, cookieErr.message);
          }
        }
      }

      if ((err.message.includes('403') || err.message.includes('Forbidden') || err.message.includes('SABR')) && state.localYtdlpPath && fs.existsSync(state.localYtdlpPath)) {
        console.log('[Download Temp] Outdated yt-dlp. Updating...');
        try {
          await runYtdlp(['-U']);
          await runYtdlp(ytdlpArgs);
          const verifiedPath = await verifyAndConvertTempAudio(videoId);
          return verifiedPath;
        } catch (updateErr) {
          console.error('[Download Temp] Self-update retry failed:', updateErr.message);
          throw err;
        }
      } else {
        throw err;
      }
    }
  });

  secureHandle('yt-download-temp-cover', async (event, { videoId, coverUrl }) => {
    requireVideoId(videoId);
    if (!coverUrl) return '';
    coverUrl = requireHttpUrl(coverUrl, 'URL da capa');
    const tempCoverPath = path.join(app.getPath('temp'), `cover_${videoId}.jpg`);
    try {
      await downloadImage(coverUrl, tempCoverPath);
      return tempCoverPath;
    } catch (err) {
      console.warn('Failed to download cover art:', err);
      return '';
    }
  });

  secureHandle('yt-package-audio', async (event, { tempAudioPath, tempCoverPath, title, artist, album, genre, year, downloadDir, videoId }) => {
    requireVideoId(videoId);
    tempAudioPath = assertPathAllowed(tempAudioPath);
    if (tempCoverPath) tempCoverPath = assertPathAllowed(tempCoverPath, ['.jpg', '.jpeg', '.png', '.webp']);
    downloadDir = assertPathAllowed(downloadDir);
    const parsed = parseVideoTitleAndArtist(title, artist);
    const cleanTitleStr = parsed.title;
    const cleanArtistStr = parsed.artist;

    const artistDir = path.join(downloadDir, sanitizeFilename(cleanArtistStr));
    const albumDir = path.join(artistDir, sanitizeFilename(album || 'Singles'));
    await fs.promises.mkdir(albumDir, { recursive: true });

    const cleanTitle = sanitizeFilename(cleanTitleStr);
    const finalFilePath = path.join(albumDir, `${cleanTitle} [${videoId}].m4a`);

    const metadataTitle = cleanTitleStr;
    const metadataArtist = cleanArtistStr;
    const metadataAlbum = album || 'Singles';
    const metadataGenre = genre || '';
    const metadataYear = year ? String(year) : '';

    const metadataArgs = [
      '-metadata', `title=${metadataTitle}`,
      '-metadata', `artist=${metadataArtist}`,
      '-metadata', `album=${metadataAlbum}`
    ];
    if (metadataGenre) metadataArgs.push('-metadata', `genre=${metadataGenre}`);
    if (metadataYear) metadataArgs.push('-metadata', `date=${metadataYear}`);

    let ffmpegArgs;
    if (tempCoverPath && fs.existsSync(tempCoverPath)) {
      ffmpegArgs = ['-y', '-i', tempAudioPath, '-i', tempCoverPath, '-map', '0:a', '-map', '1:v', '-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', ...metadataArgs, finalFilePath];
    } else {
      ffmpegArgs = ['-y', '-i', tempAudioPath, '-c:a', 'copy', ...metadataArgs, finalFilePath];
    }

    await runFfmpeg(ffmpegArgs);
    return finalFilePath;
  });

  secureHandle('yt-fetch-save-lyrics', async (event, { title, artist, album, duration, finalFilePath, videoId }) => {
    requireVideoId(videoId);
    finalFilePath = assertPathAllowed(finalFilePath, ['.m4a', '.mp3', '.flac', '.ogg', '.wav', '.aac']);
    const finalLrcPath = finalFilePath.substring(0, finalFilePath.lastIndexOf('.')) + '.lrc';
    let lrcContent = '';
    try {
      const lyricsData = await fetchLrcLyrics(title, artist, album, duration);
      if (lyricsData) {
        if (lyricsData.syncedLyrics) {
          lrcContent = lyricsData.syncedLyrics;
          await fs.promises.writeFile(finalLrcPath, lyricsData.syncedLyrics, 'utf8');
        } else if (lyricsData.plainLyrics) {
          lrcContent = lyricsData.plainLyrics;
          await fs.promises.writeFile(finalLrcPath, lyricsData.plainLyrics, 'utf8');
        }
      }
    } catch (lrcErr) {
      console.warn('Failed to fetch/save lyrics:', lrcErr);
    }
    return { lrcContent, hasLrc: !!lrcContent };
  });

  secureHandle('yt-cleanup-temp-files', async (event, { tempAudioPath, tempCoverPath }) => {
    tempAudioPath = assertPathAllowed(tempAudioPath);
    if (tempCoverPath) tempCoverPath = assertPathAllowed(tempCoverPath);
    try {
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }
      if (tempCoverPath && fs.existsSync(tempCoverPath)) {
        fs.unlinkSync(tempCoverPath);
      }
      return true;
    } catch (err) {
      console.error('Failed to cleanup temp files:', err);
      return false;
    }
  });

  secureHandle('update-track-metadata', async (event, { filePath, metadata, coverArt }) => {
    filePath = assertPathAllowed(filePath, ['.m4a', '.mp3', '.flac', '.ogg', '.wav', '.aac']);
    try {
      if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
        throw new Error('Arquivo não encontrado');
      }

      const ext = path.extname(filePath).toLowerCase();
      const allowedExts = ['.mp3', '.m4a', '.flac', '.ogg', '.wma', '.wav', '.aac', '.opus'];
      if (!allowedExts.includes(ext)) {
        throw new Error('Tipo de arquivo não suportado para edição de metadados');
      }

      const resolvedPath = path.resolve(filePath);
      const stats = await fs.promises.stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error('Caminho não é um arquivo');
      }

      const ffmpegBin = getFfmpegExecutable();
      const metadataTitle = String(metadata.title || '');
      const metadataArtist = String(metadata.artist || '');
      const metadataAlbum = String(metadata.album || '');
      const metadataGenre = String(metadata.genre || '');
      const metadataYear = metadata.year ? String(metadata.year) : '';
      const metadataTrack = metadata.trackNumber ? String(metadata.trackNumber) : '';

      const tempOutputPath = `${resolvedPath}.tmp${ext}`;
      let tempCoverPath = null;

      const baseArgs = [
        '-y',
        '-i', resolvedPath
      ];

      const metadataArgs = [
        '-metadata', `title=${metadataTitle}`,
        '-metadata', `artist=${metadataArtist}`,
        '-metadata', `album=${metadataAlbum}`
      ];
      if (metadataGenre) metadataArgs.push('-metadata', `genre=${metadataGenre}`);
      if (metadataYear) metadataArgs.push('-metadata', `date=${metadataYear}`);
      if (metadataTrack) metadataArgs.push('-metadata', `track=${metadataTrack}`);

      let args = [];

      if (coverArt) {
        const coverBuffer = Buffer.from(coverArt.split(',')[1] || '', 'base64');
        tempCoverPath = path.join(app.getPath('temp'), `metadata_cover_${Date.now()}.jpg`);
        await fs.promises.writeFile(tempCoverPath, coverBuffer);
        args = [
          ...baseArgs,
          '-i', tempCoverPath,
          '-map', '0:a',
          '-map', '1:v',
          '-c:a', 'copy',
          '-c:v', 'mjpeg',
          '-disposition:v', 'attached_pic',
          ...metadataArgs,
          tempOutputPath
        ];
      } else {
        args = [
          ...baseArgs,
          '-c', 'copy',
          ...metadataArgs,
          tempOutputPath
        ];
      }

      await new Promise((resolve, reject) => {
        execFile(ffmpegBin, args, (err, stdout, stderr) => {
          if (err) {
            console.error('ffmpeg metadata update error:', stderr);
            reject(err);
          } else {
            resolve(stdout);
          }
        });
      });

      if (tempCoverPath) {
        await fs.promises.unlink(tempCoverPath).catch(() => {});
      }

      await fs.promises.rename(tempOutputPath, resolvedPath);
      return { success: true };
    } catch (err) {
      console.error('Failed to update track metadata:', err);
      return { success: false, error: err.message };
    }
  });

  secureHandle('update-playlist-metadata', async (event, { playlistId, metadata }) => {
    return { success: true, playlistId, metadata };
  });
}

module.exports = registerYoutubeHandlers;
