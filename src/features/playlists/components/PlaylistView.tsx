import React, { useEffect, useState } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { MetadataEditorModal } from '../../../components/ui/MetadataEditorModal';
import { Play, Pause, Clock, Disc, Trash2, Edit2, Download, Loader2, Check, AlertCircle, ArrowLeft, RefreshCw, Heart, MoreHorizontal, FolderUp } from 'lucide-react';
import { TrackMenuDropdown } from '../../../components/ui/TrackMenuDropdown';
import { getDominantColor } from '../../../utils/colorExtractor';
import type { Track, Playlist } from '../../../shared/types';
import { getYouTubeIdFromTrack } from '../../../utils/libraryEngine';
import { isOnlineCapable } from '../../../services/platformService';
import styles from '../styles/PlaylistView.module.css';

export const PlaylistView: React.FC = () => {
  const { 
    tracks, 
    folders,
    playlists,
    viewParams, 
    currentTrack, 
    isPlaying, 
    playTrack, 
    togglePlay,
    removeTrackFromPlaylist,
    setView,
    goBack,
    downloadQueue,
    addTracksToDownloadQueue,
    createPlaylist,
    showAlert,
    updatePlaylistTrackIds,
    toggleTrackFavorite,
    updatePlaylistMetadata
  } = useMediaLibrary();

  const [onlineTracks, setOnlineTracks] = useState<any[]>([]);
  const [loadingOnline, setLoadingOnline] = useState(false);

  const isYoutube = viewParams.source === 'youtube';
  const isSpotify = viewParams.source === 'spotify';
  const isOnline = isYoutube || isSpotify;
  const playlistId = viewParams.id || '';
  const playlistName = viewParams.name || '';
  const playlistCover = viewParams.coverUrl || '';
  const playlistArtist = viewParams.artist || (isSpotify ? 'Spotify' : 'YouTube Music');

  // Find local playlist if it exists
  const playlist = playlists.find(p => p.id === playlistId);

  // Local tracks with auto-healing for Spotify paths
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [activeTrackDropdown, setActiveTrackDropdown] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  useEffect(() => {
    if (!playlist) {
      setPlaylistTracks([]);
      return;
    }

    let needsUpdate = false;
    const updatedIds = [...playlist.trackIds];

    const resolved = playlist.trackIds
      .map((id, index) => {
        let match = tracks.find(t => t.id === id);
        if (!match && id.includes('[spotify-')) {
          // Attempt to match by title and artist from path
          const filename = id.substring(id.lastIndexOf('/') + 1);
          // Remove '[spotify-xxx].m4a'
          const cleanTitle = filename.replace(/\s*\[spotify-[^\]]+\]\.m4a$/i, '').trim().toLowerCase();
          const pathParts = id.split('/');
          const folderArtist = pathParts[pathParts.length - 3]?.trim().toLowerCase();

          match = tracks.find(t => {
            const tTitle = t.title.toLowerCase();
            const tArtist = t.artist.toLowerCase();
            return tTitle === cleanTitle && (tArtist === folderArtist || tArtist.includes(folderArtist) || folderArtist.includes(tArtist));
          });

          if (match) {
            updatedIds[index] = match.id;
            needsUpdate = true;
          }
        }
        return match;
      })
      .filter((t): t is Track => !!t);

    setPlaylistTracks(resolved);

    if (needsUpdate) {
      console.log('[Playlist Auto-Heal] Updating playlist track IDs with resolved local paths:', updatedIds);
      updatePlaylistTrackIds(playlist.id, updatedIds).catch(err => {
        console.error('[Playlist Auto-Heal] Failed to save auto-healed playlist:', err);
      });
    }
  }, [playlist, tracks]);

  const firstTrackWithArt = playlistTracks.find(t => !!t.coverArt);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncPlaylist = async () => {
    if (!playlist || !playlist.ytPlaylistId || isSyncing) return;

    setIsSyncing(true);
    try {
      // 1. Fetch tracks currently on YouTube for this playlist ID
      const latestOnlineTracks = await window.electronAPI?.getPlaylistTracks(playlist.ytPlaylistId);
      if (!latestOnlineTracks || !Array.isArray(latestOnlineTracks)) {
        throw new Error("Não foi possível obter as faixas da playlist do YouTube.");
      }

      const downloadDir = folders[0] || '';
      if (!downloadDir || downloadDir.trim() === '') {
        showAlert(
          'Pasta de Biblioteca Necessária', 
          'Por favor, vá em Configurações e adicione pelo menos uma Pasta da Biblioteca antes de iniciar.'
        );
        setIsSyncing(false);
        return;
      }
      
      const sanitize = (name: string) => name.replace(/[\\/*?:"<>|]/g, "");
      const base = downloadDir.replace(/\\/g, '/').replace(/\/$/, '');

      // Check which tracks need to be added to the playlist
      const newTrackIdsToAdd: string[] = [];
      const newTracksToDownload: any[] = [];

      for (const track of latestOnlineTracks) {
        // Find if we already have it in tracks library
        let localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === track.videoId);

        // For Spotify, the downloaded track will have a real YouTube ID instead of the spotify- placeholder.
        // We must match by title and artist if the videoId match fails.
        if (!localMatch && isSpotify) {
          localMatch = tracks.find(t => 
            t.title.toLowerCase() === track.name.toLowerCase() && 
            t.artist.toLowerCase() === (track.artist?.name || 'Artista Desconhecido').toLowerCase()
          );
        }

        let targetFilePath = '';
        if (localMatch) {
          targetFilePath = localMatch.id;
        } else {
          // Predict future filePath
          const cleanArtist = sanitize(track.artist?.name || 'Artista Desconhecido');
          const cleanAlbum = sanitize(track.album?.name || 'Unknown');
          const cleanTitle = sanitize(track.name);
          targetFilePath = `${base}/${cleanArtist}/${cleanAlbum}/${cleanTitle} [${track.videoId}].m4a`;

          // Put it in queue if not already there
          const inQueue = downloadQueue.some(q => q.videoId === track.videoId);
          if (!inQueue) {
            newTracksToDownload.push({
              videoId: track.videoId,
              name: track.name,
              artist: track.artist?.name || 'Artista Desconhecido',
              album: track.album?.name || '',
              coverUrl: track.thumbnails && track.thumbnails.length > 0 ? track.thumbnails[track.thumbnails.length - 1].url : (firstTrackWithArt?.coverArt || ''),
              duration: track.duration || null,
              year: track.year || null
            });
          }
        }

        // Check if this filePath is already in the playlist's trackIds list
        if (!playlist.trackIds.includes(targetFilePath)) {
          newTrackIdsToAdd.push(targetFilePath);
        }
      }

      if (newTrackIdsToAdd.length > 0 || newTracksToDownload.length > 0) {
        // Update playlist in state and cache
        const updatedTrackIds = [...playlist.trackIds, ...newTrackIdsToAdd];
        await updatePlaylistTrackIds(playlist.id, updatedTrackIds);

        if (newTracksToDownload.length > 0) {
          addTracksToDownloadQueue(newTracksToDownload);
          showAlert(
            'Sincronização Iniciada',
            `Foram encontradas ${newTrackIdsToAdd.length} novas músicas na playlist do YouTube. ${newTracksToDownload.length} nova(s) música(s) começaram a ser baixadas.`
          );
        } else {
          showAlert(
            'Playlist Atualizada',
            `Sua playlist local foi atualizada. ${newTrackIdsToAdd.length} nova(s) música(s) que já existiam na biblioteca foram associadas a ela.`
          );
        }
      } else {
        showAlert('Playlist Atualizada', 'Nenhuma música nova encontrada. Sua playlist já está sincronizada!');
      }

    } catch (err: any) {
      console.error('Falha ao sincronizar playlist:', err);
      showAlert('Erro de Sincronização', `Não foi possível sincronizar com a playlist do YouTube: ${err.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isYoutube && playlistId) {
      setLoadingOnline(true);
      window.electronAPI?.getPlaylistTracks(playlistId)
        .then((data: any) => {
          if (Array.isArray(data)) {
            setOnlineTracks(data);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingOnline(false));
    } else if (isSpotify && viewParams.tracks) {
      // Use the tracks already passed in viewParams for Spotify
      setOnlineTracks(viewParams.tracks);
    }
  }, [playlistId, isYoutube, isSpotify, viewParams.tracks]);

  // Extract cover art color to drive background gradient
  useEffect(() => {
    const artSource = isOnline ? playlistCover : (playlist?.coverUrl || firstTrackWithArt?.coverArt || '');
    if (artSource) {
      getDominantColor(artSource).then(color => {
        document.documentElement.style.setProperty('--theme-color', color);
      });
    } else {
      document.documentElement.style.setProperty('--theme-color', 'rgb(83, 83, 83)');
    }
    
    return () => {
      document.documentElement.style.setProperty('--theme-color', 'rgb(83, 83, 83)');
    };
  }, [playlistId, firstTrackWithArt, isOnline, playlistCover, playlist?.coverUrl]);

  if (!isOnline && !playlist) {
    return (
      <div style={{ color: 'var(--text-subdued)', padding: '20px 0', fontSize: '14px' }}>
        Playlist não encontrada.
      </div>
    );
  }

  // Format track duration
  const formatDuration = (secs: number) => {
    if (!secs) return '--:--';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Format total playlist duration
  const getTotalDuration = () => {
    const totalSecs = isOnline
      ? onlineTracks.reduce((acc, t) => acc + (t.duration || 0), 0)
      : playlistTracks.reduce((acc, t) => acc + t.duration, 0);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    
    if (hrs > 0) {
      return `${hrs} h ${mins} min`;
    }
    return `${mins} min`;
  };

  const handleRowClick = (track: Track) => {
    if (currentTrack && currentTrack.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, playlistTracks);
    }
  };

  const handlePlayPlaylistClick = () => {
    if (playlistTracks.length === 0) return;
    
    const isPlayingFromThisPlaylist = currentTrack && playlistTracks.some(t => t.id === currentTrack.id);
    if (isPlayingFromThisPlaylist) {
      togglePlay();
    } else {
      playTrack(playlistTracks[0], playlistTracks);
    }
  };

  const handleRenamePlaylist = async () => {
    if (isYoutube || !playlist) return;
    setIsEditingMetadata(true);
  };

  const handleSavePlaylistMetadata = async (metadata: Partial<Playlist>, coverDataUrl?: string | null) => {
    if (isYoutube || !playlist) return false;
    const success = await updatePlaylistMetadata(playlist.id, {
      name: metadata.name,
      coverUrl: coverDataUrl ?? undefined
    });
    if (success && metadata.name) {
      setView('playlist', { id: playlist.id, name: metadata.name });
    }
    return success;
  };

  const handleExportPlaylist = async () => {
    if (!playlist || isExporting || playlistTracks.length === 0) return;

    setIsExporting(true);
    setExportProgress({ current: 0, total: playlistTracks.length, title: 'Iniciando...' });

    let cleanupProgress: (() => void) | undefined;
    if (window.electronAPI?.onExportProgress) {
      cleanupProgress = window.electronAPI.onExportProgress((progress) => {
        setExportProgress(progress);
      });
    }

    try {
      const result = await window.electronAPI?.exportPlaylist?.({
        playlistName: playlist.name,
        tracks: playlistTracks.map(t => ({
          id: t.id,
          filePath: t.filePath,
          title: t.title,
          artist: t.artist,
          album: t.album,
          year: t.year,
          genre: t.genre,
          hasLrcFile: t.hasLrcFile
        }))
      });

      if (!result) {
        throw new Error('Não foi possível iniciar a exportação.');
      }

      if (result.success) {
        showAlert(
          'Exportação Concluída',
          `Sua playlist foi exportada com sucesso para:\n${result.path}\n\nExportadas: ${result.successCount} música(s)\nFalhas: ${result.failCount}`
        );
      } else {
        if (result.error && !result.error.includes('cancelada')) {
          showAlert('Erro na Exportação', `Ocorreu um erro ao exportar a playlist: ${result.error}`);
        }
      }
    } catch (err: any) {
      console.error('Falha ao exportar playlist:', err);
      showAlert('Erro na Exportação', `Não foi possível exportar a playlist: ${err.message || err}`);
    } finally {
      setIsExporting(false);
      if (cleanupProgress) {
        cleanupProgress();
      }
      setExportProgress(null);
    }
  };

  const isCurrentPlaylistPlaying = isPlaying && currentTrack && playlistTracks.some(t => t.id === currentTrack.id);

  const handleDownloadFullPlaylist = async () => {
    if (onlineTracks.length === 0) return;

    const downloadDir = folders[0] || '';
    if (!downloadDir || downloadDir.trim() === '') {
      showAlert(
        'Pasta de Biblioteca Necessária', 
        'Por favor, vá em Configurações e adicione pelo menos uma Pasta da Biblioteca antes de iniciar.'
      );
      return;
    }

    // 1. Map/Predict track IDs (filePaths) in local database format
    // If a track already exists, use its actual local track ID (filePath).
    // Otherwise, predict the future filePath.
    const sanitize = (name: string) => name.replace(/[\\/*?:"<>|]/g, "");
    const base = downloadDir.replace(/\\/g, '/').replace(/\/$/, '');
    
    const trackIds = onlineTracks.map(track => {
      let localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === track.videoId);
      if (!localMatch && isSpotify) {
        localMatch = tracks.find(t => 
          t.title.toLowerCase() === track.name.toLowerCase() && 
          t.artist.toLowerCase() === (track.artist?.name || 'Artista Desconhecido').toLowerCase()
        );
      }

      if (localMatch) {
        return localMatch.id;
      }
      const cleanArtist = sanitize(track.artist?.name || 'Artista Desconhecido');
      const cleanAlbum = sanitize(track.album?.name || 'Unknown');
      const cleanTitle = sanitize(track.name);
      return `${base}/${cleanArtist}/${cleanAlbum}/${cleanTitle} [${track.videoId}].m4a`;
    });

    // 2. Create local playlist in SQLite database
    await createPlaylist(playlistName, trackIds, playlistId, playlistCover);

    // 3. Prepare downloads list for missing tracks
    const existingLocalVideoIds = new Set(
      tracks.map(t => getYouTubeIdFromTrack(t)).filter((id): id is string => id !== null)
    );

    const tracksToDownload = onlineTracks.map(track => ({
      videoId: track.videoId,
      name: track.name,
      artist: track.artist?.name || 'Artista Desconhecido',
      album: track.album?.name || '',
      coverUrl: track.thumbnails && track.thumbnails.length > 0 ? track.thumbnails[track.thumbnails.length - 1].url : playlistCover,
      duration: track.duration || null,
      year: track.year || null
    }));

    const missingTracks = tracksToDownload.filter(track => {
      const inQueue = downloadQueue.some(q => q.videoId === track.videoId);
      let isDownloaded = existingLocalVideoIds.has(track.videoId);
      
      if (!isDownloaded && isSpotify) {
        isDownloaded = tracks.some(t => 
          t.title.toLowerCase() === track.name.toLowerCase() && 
          t.artist.toLowerCase() === track.artist.toLowerCase()
        );
      }
      
      return !inQueue && !isDownloaded;
    });

    if (missingTracks.length > 0) {
      addTracksToDownloadQueue(missingTracks);
      showAlert(
        'Download Iniciado',
        `A playlist "${playlistName}" foi criada na sua biblioteca e ${missingTracks.length} nova(s) música(s) começaram a ser baixadas.`
      );
    } else {
      showAlert(
        'Playlist Criada',
        `A playlist "${playlistName}" foi criada na sua biblioteca utilizando as músicas que já estão disponíveis localmente.`
      );
    }
  };

  return (
    <div>
      {/* Back button */}
      <button 
        onClick={goBack} 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          background: 'none', 
          border: 'none', 
          color: 'var(--text-subdued)', 
          cursor: 'pointer', 
          fontSize: '14px', 
          fontWeight: 600,
          marginBottom: '20px',
          padding: '4px 0'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-base)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-subdued)')}
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      {/* Playlist Info Header */}
      <div className={styles.albumHeaderContainer}>
        {isOnline ? (
          playlistCover ? (
            <img src={playlistCover} alt={playlistName} className={styles.albumCoverLg} />
          ) : (
            <div className={styles.albumCoverLg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
              <Disc size={96} color="#727272" />
            </div>
          )
        ) : (
          (playlist?.coverUrl || firstTrackWithArt?.coverArt) ? (
            <img src={playlist?.coverUrl || firstTrackWithArt!.coverArt} alt={playlist?.name || playlistName} className={styles.albumCoverLg} />
          ) : (
            <div className={styles.albumCoverLg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
              <Disc size={96} color="#727272" />
            </div>
          )
        )}

        <div className={styles.albumInfoContainer}>
          <span className={styles.albumTag}>{isOnline ? 'Playlist Online' : 'Playlist'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 className={styles.albumTitleLg}>{isOnline ? playlistName : playlist?.name || ''}</h1>
            {!isOnline && (
              <button 
                className={styles.deleteBtn}
                style={{ opacity: 1, padding: '8px' }}
                onClick={handleRenamePlaylist}
                title="Editar playlist"
              >
                <Edit2 size={18} color="var(--text-subdued)" />
              </button>
            )}
          </div>
          <div className={styles.albumMeta}>
            <span className={styles.albumMetaArtist}>{isOnline ? playlistArtist : 'Criada por você'}</span>
            <span className={styles.albumMetaBullet}>•</span>
            {isOnline ? (
              <>
                <span className={styles.albumMetaSub}>{onlineTracks.length} músicas</span>
                {onlineTracks.length > 0 && (
                  <>
                    <span className={styles.albumMetaBullet}>•</span>
                    <span className={styles.albumMetaSub} style={{ color: 'var(--text-subdued)' }}>{getTotalDuration()}</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className={styles.albumMetaSub}>{playlistTracks.length} músicas</span>
                {playlistTracks.length > 0 && (
                  <>
                    <span className={styles.albumMetaBullet}>•</span>
                    <span className={styles.albumMetaSub} style={{ color: 'var(--text-subdued)' }}>{getTotalDuration()}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action controls */}
      <div className={styles.actionControls} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {!isOnline ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              className={styles.playCircleLg} 
              onClick={handlePlayPlaylistClick}
              title={isCurrentPlaylistPlaying ? 'Pausar' : 'Tocar playlist'}
              disabled={playlistTracks.length === 0}
            >
              {isCurrentPlaylistPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />}
            </button>
            
            {isOnlineCapable() && playlist?.ytPlaylistId && (
              <button
                className={styles.syncPlaylistBtn}
                onClick={handleSyncPlaylist}
                disabled={isSyncing}
              >
                <RefreshCw size={14} className={isSyncing ? 'spinning' : ''} style={{ animation: isSyncing ? 'spin 1.5s infinite linear' : 'none' }} />
                {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}

            {window.electronAPI?.exportPlaylist && playlistTracks.length > 0 && (
              <button
                className={styles.syncPlaylistBtn}
                onClick={handleExportPlaylist}
                disabled={isExporting}
              >
                <FolderUp size={14} className={isExporting ? 'spinning' : ''} style={{ animation: isExporting ? 'spin 1.5s infinite linear' : 'none' }} />
                {isExporting ? 'Exportando...' : 'Exportar Playlist'}
              </button>
            )}
          </div>
        ) : isOnlineCapable() ? (
          <button
            className={styles.playBtnGreen}
            onClick={handleDownloadFullPlaylist}
            disabled={loadingOnline || onlineTracks.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Download size={18} />
            Baixar Playlist Completa
          </button>
        ) : null}
      </div>

      {/* Tracks Table */}
      {isOnline ? (
        loadingOnline ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <div className="spinner"></div>
          </div>
        ) : onlineTracks.length === 0 ? (
          <div style={{ color: 'var(--text-subdued)', padding: '40px 0', textAlign: 'center', fontSize: '14px' }}>
            Nenhuma música encontrada nesta playlist.
          </div>
        ) : (
          <table className={styles.tracksTable}>
            <thead>
              <tr>
                <th className={styles.trackRowNum}>#</th>
                <th>Título</th>
                <th className={styles.trackRowDuration}><Clock size={16} /></th>
                <th style={{ width: '80px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {onlineTracks.map((track, idx) => {
                let localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === track.videoId);
                
                // For Spotify, the downloaded track will have a real YouTube ID instead of the spotify- placeholder.
                // We must match by title and artist if the videoId match fails.
                if (!localMatch && isSpotify) {
                  localMatch = tracks.find(t => 
                    t.title.toLowerCase() === track.name.toLowerCase() && 
                    t.artist.toLowerCase() === (track.artist?.name || 'Artista Desconhecido').toLowerCase()
                  );
                }

                const isDownloaded = !!localMatch;
                const queueItem = downloadQueue.find(q => q.videoId === track.videoId);
                const status = isDownloaded ? 'completed' : (queueItem ? queueItem.status : 'idle');
                const isTrackPlaying = localMatch && currentTrack?.id === localMatch.id && isPlaying;

                return (
                  <tr 
                    key={track.videoId} 
                    className={`${styles.trackRow} ${isTrackPlaying ? styles.active : ''}`}
                    onClick={() => {
                      if (isDownloaded && localMatch) {
                        handleRowClick(localMatch);
                      }
                    }}
                    style={{ cursor: isDownloaded ? 'pointer' : 'default' }}
                  >
                    <td className={styles.trackRowNum}>
                      {isTrackPlaying ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>
                        </div>
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td>
                      <div className={styles.trackRowTitleCol}>
                        <div className={styles.trackRowDetails}>
                          <span className={styles.trackRowTitle} style={{ color: isTrackPlaying ? 'var(--spotify-green)' : 'inherit' }}>
                            {track.name}
                            {isDownloaded && (
                              <span style={{ 
                                fontSize: '10px', 
                                backgroundColor: 'rgba(29, 185, 84, 0.15)', 
                                color: 'var(--spotify-green)', 
                                padding: '2px 6px', 
                                borderRadius: '10px', 
                                marginLeft: '8px', 
                                fontWeight: 700 
                              }}>
                                Baixada
                              </span>
                            )}
                          </span>
                          <span className={styles.trackRowArtist}>
                            {track.artist?.name || 'Artista Desconhecido'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.trackRowDuration}>
                      {formatDuration(track.duration)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        {status === 'downloading' || status === 'resolving' || status === 'packaging' ? (
                          <Loader2 size={16} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)' }} />
                        ) : status === 'pending' ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-subdued)' }}>Fila</span>
                        ) : isDownloaded && localMatch ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <button 
                              className={styles.addToPlaylistBtn} 
                              onClick={() => toggleTrackFavorite(localMatch.id)}
                              title={localMatch.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                              style={{ color: localMatch.isFavorite ? 'var(--spotify-green)' : 'var(--text-subdued)', padding: 0 }}
                            >
                              <Heart size={14} fill={localMatch.isFavorite ? "currentColor" : "none"} />
                            </button>
                            <Check size={16} color="var(--spotify-green)" />
                          </div>
                        ) : status === 'error' ? (
                          <span title="Erro no download"><AlertCircle size={16} color="#e91429" /></span>
                        ) : isOnlineCapable() ? (
                          <button
                            className={styles.addToPlaylistBtn}
                            onClick={() => addTracksToDownloadQueue([{
                              videoId: track.videoId,
                              name: track.name,
                              artist: track.artist?.name || 'Artista Desconhecido',
                              album: track.album?.name || '',
                              coverUrl: track.thumbnails && track.thumbnails.length > 0 ? track.thumbnails[track.thumbnails.length - 1].url : playlistCover,
                              duration: track.duration || null,
                              year: track.year || null
                            }])}
                            title="Baixar música"
                          >
                            <Download size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : playlistTracks.length === 0 ? (
        <div style={{ color: 'var(--text-subdued)', padding: '40px 0', textAlign: 'center', fontSize: '14px' }}>
          Esta playlist está vazia. Adicione músicas buscando-as e clicando no botão "+" ao passar o mouse sobre a linha da música.
        </div>
      ) : (
        <table className={styles.tracksTable}>
          <thead>
            <tr>
              <th className={styles.trackRowNum}>#</th>
              <th>Título</th>
              <th className={styles.trackColumnAlbum}>Álbum</th>
              <th className={styles.trackRowDuration}><Clock size={16} /></th>
              <th style={{ width: '120px' }}></th>
            </tr>
          </thead>
          <tbody>
            {playlistTracks.map((track, idx) => {
              const isActive = currentTrack?.id === track.id;
              return (
                <tr 
                  key={track.id} 
                  className={`${styles.trackRow} ${isActive ? styles.active : ''}`}
                  onClick={() => handleRowClick(track)}
                >
                  <td className={styles.trackRowNum} style={{ color: isActive ? 'var(--spotify-green)' : 'inherit' }}>
                    {isActive && isPlaying ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>
                      </div>
                    ) : (
                      idx + 1
                    )}
                  </td>
                  <td>
                    <div className={styles.trackRowTitleCol}>
                      {track.coverArt ? (
                        <img src={track.coverArt} alt={track.title} className={styles.trackRowArt} />
                      ) : (
                        <div className={styles.trackRowArt} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                          <Disc size={18} color="#727272" />
                        </div>
                      )}
                      <div className={styles.trackRowDetails}>
                        <span className={styles.trackRowTitle}>{track.title}</span>
                        <span className={styles.trackRowArtist} style={{ color: isActive ? 'var(--spotify-green)' : 'inherit' }}>
                          {track.artist}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className={styles.trackColumnAlbum}>
                    <span className={styles.trackRowAlbum}>{track.album}</span>
                  </td>
                  <td className={styles.trackRowDuration}>
                    {formatDuration(track.duration)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                      <button 
                        className={styles.addToPlaylistBtn} 
                        onClick={() => toggleTrackFavorite(track.id)}
                        title={track.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        style={{ color: track.isFavorite ? 'var(--spotify-green)' : 'var(--text-subdued)', padding: 0 }}
                      >
                        <Heart size={14} fill={track.isFavorite ? "currentColor" : "none"} />
                      </button>
                      <button 
                        className={styles.deleteBtn}
                        title="Remover desta playlist"
                        onClick={() => {
                          removeTrackFromPlaylist(playlist?.id || '', track.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <button 
                        className={styles.addToPlaylistBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTrackDropdown(activeTrackDropdown === track.id ? null : track.id);
                        }}
                        title="Opções"
                        style={{ padding: 0 }}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {activeTrackDropdown === track.id && (
                        <TrackMenuDropdown 
                          trackId={track.id} 
                          onClose={() => setActiveTrackDropdown(null)} 
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {playlist && (
        <MetadataEditorModal
          type="playlist"
          item={playlist}
          isOpen={isEditingMetadata}
          onClose={() => setIsEditingMetadata(false)}
          onSave={handleSavePlaylistMetadata}
        />
      )}
      {isExporting && exportProgress && (
        <div className="system-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="system-modal-container" style={{ width: '400px', textAlign: 'center', padding: '30px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>Exportando Playlist</h3>
            <p style={{ color: 'var(--text-subdued)', fontSize: '14px', margin: '0 0 20px 0', minHeight: '40px', wordBreak: 'break-word' }}>
              Processando: <strong>{exportProgress.title}</strong>
            </p>
            <div style={{ 
              width: '100%', 
              height: '8px', 
              backgroundColor: 'rgba(255, 255, 255, 0.1)', 
              borderRadius: '4px', 
              overflow: 'hidden', 
              marginBottom: '12px' 
            }}>
              <div style={{ 
                width: `${exportProgress.total > 0 ? (exportProgress.current / exportProgress.total) * 100 : 0}%`, 
                height: '100%', 
                backgroundColor: 'var(--spotify-green)', 
                borderRadius: '4px',
                transition: 'width 0.3s ease' 
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-subdued)' }}>
              <span>{exportProgress.current} de {exportProgress.total} músicas</span>
              <span>{exportProgress.total > 0 ? Math.round((exportProgress.current / exportProgress.total) * 100) : 0}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
