import React, { useEffect, useState } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { Play, Pause, Clock, Disc, MoreHorizontal, Download, Loader2, Check, AlertCircle, ArrowLeft, FolderUp, Trash2 } from 'lucide-react';
import { getDominantColor } from '../../../utils/colorExtractor';
import type { Track } from '../../../shared/types';
import { getYouTubeIdFromTrack } from '../../../utils/libraryEngine';
import { TrackMenuDropdown } from '../../../components/ui/TrackMenuDropdown';
import styles from '../styles/AlbumView.module.css';

export const AlbumView: React.FC = () => {
  const { 
    tracks, 
    viewParams, 
    currentTrack, 
    isPlaying, 
    playTrack, 
    togglePlay,
    goBack,
    downloadQueue,
    addTracksToDownloadQueue,
    showAlert,
    deleteAlbum
  } = useMediaLibrary();

  const [activeTrackDropdown, setActiveTrackDropdown] = useState<string | null>(null);
  const [onlineTracks, setOnlineTracks] = useState<any[]>([]);
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  const isYoutube = viewParams.source === 'youtube';
  const albumName = viewParams.name || '';
  const albumArtist = viewParams.artist || '';
  const albumCover = viewParams.coverUrl || '';

  // Local tracks
  const albumTracks = tracks
    .filter(t => t.album.toLowerCase() === albumName.toLowerCase())
    .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));

  const firstTrack = albumTracks[0];

  useEffect(() => {
    if (isYoutube && viewParams.id) {
      setLoadingOnline(true);
      window.electronAPI?.getAlbumTracks(viewParams.id)
        .then((data: any) => {
          if (data) {
            setOnlineTracks(data.songs || data.tracks || []);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingOnline(false));
    }
  }, [viewParams.id, isYoutube]);

  // Extract cover art color to drive background gradient
  useEffect(() => {
    const artSource = isYoutube ? albumCover : (firstTrack?.coverArt || '');
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
  }, [albumName, firstTrack, isYoutube, albumCover]);

  // Format track duration
  const formatDuration = (secs: number) => {
    if (!secs) return '--:--';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Format total album duration
  const getTotalDuration = () => {
    const totalSecs = isYoutube 
      ? onlineTracks.reduce((acc, t) => acc + (t.duration || 0), 0)
      : albumTracks.reduce((acc, t) => acc + t.duration, 0);
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
      playTrack(track, albumTracks);
    }
  };

  const handlePlayAlbumClick = () => {
    if (albumTracks.length === 0) return;
    
    // Check if currently playing a song from this album
    const isPlayingFromThisAlbum = currentTrack && albumTracks.some(t => t.id === currentTrack.id);
    
    if (isPlayingFromThisAlbum) {
      togglePlay();
    } else {
      playTrack(albumTracks[0], albumTracks);
    }
  };

  const isCurrentAlbumPlaying = isPlaying && currentTrack && albumTracks.some(t => t.id === currentTrack.id);

  const handleDownloadFullAlbum = () => {
    if (onlineTracks.length === 0) return;
    
    // Try to get the year from album metadata (AlbumFull object includes year field)
    const albumYear = viewParams.year || null;
    
    const tracksToDownload = onlineTracks.map(track => ({
      videoId: track.videoId,
      name: track.name,
      artist: track.artist?.name || albumArtist,
      album: albumName,
      coverUrl: albumCover || (track.thumbnails && track.thumbnails.length > 0 ? track.thumbnails[track.thumbnails.length - 1].url : ''),
      duration: track.duration || null,
      year: albumYear
    }));

    addTracksToDownloadQueue(tracksToDownload);
  };

  const handleExportAlbum = async () => {
    if (isExporting || albumTracks.length === 0) return;

    setIsExporting(true);
    setExportProgress({ current: 0, total: albumTracks.length, title: 'Iniciando...' });

    let cleanupProgress: (() => void) | undefined;
    if (window.electronAPI?.onExportProgress) {
      cleanupProgress = window.electronAPI.onExportProgress((progress) => {
        setExportProgress(progress);
      });
    }

    try {
      const result = await window.electronAPI?.exportPlaylist?.({
        playlistName: albumName,
        tracks: albumTracks.map(t => ({
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
          `Seu álbum foi exportado com sucesso para:\n${result.path}\n\nExportadas: ${result.successCount} música(s)\nFalhas: ${result.failCount}`
        );
      } else {
        if (result.error && !result.error.includes('cancelada')) {
          showAlert('Erro na Exportação', `Ocorreu um erro ao exportar o álbum: ${result.error}`);
        }
      }
    } catch (err: any) {
      console.error('Falha ao exportar álbum:', err);
      showAlert('Erro na Exportação', `Não foi possível exportar o álbum: ${err.message || err}`);
    } finally {
      setIsExporting(false);
      if (cleanupProgress) {
        cleanupProgress();
      }
      setExportProgress(null);
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

      {/* Album Info Header */}
      <div className={styles.albumHeaderContainer}>
        {isYoutube ? (
          albumCover ? (
            <img src={albumCover} alt={albumName} className={styles.albumCoverLg} />
          ) : (
            <div className={styles.albumCoverLg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
              <Disc size={96} color="#727272" />
            </div>
          )
        ) : (
          firstTrack && firstTrack.coverArt ? (
            <img src={firstTrack.coverArt} alt={albumName} className={styles.albumCoverLg} />
          ) : (
            <div className={styles.albumCoverLg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
              <Disc size={96} color="#727272" />
            </div>
          )
        )}

        <div className={styles.albumInfoContainer}>
          <span className={styles.albumTag}>{isYoutube ? 'Álbum Online' : 'Álbum'}</span>
          <h1 className={styles.albumTitleLg}>{albumName}</h1>
          <div className={styles.albumMeta}>
            <span className={styles.albumMetaArtist}>{isYoutube ? albumArtist : (firstTrack?.artist || 'Artista Desconhecido')}</span>
            <span className={styles.albumMetaBullet}>•</span>
            {isYoutube ? (
              <>
                <span className={styles.albumMetaSub}>{onlineTracks.length} músicas</span>
                <span className={styles.albumMetaBullet}>•</span>
                <span className={styles.albumMetaSub} style={{ color: 'var(--text-subdued)' }}>{getTotalDuration()}</span>
              </>
            ) : (
              <>
                <span className={styles.albumMetaSub}>{firstTrack?.year || 'Ano N/A'}</span>
                <span className={styles.albumMetaBullet}>•</span>
                <span className={styles.albumMetaSub}>{albumTracks.length} músicas</span>
                <span className={styles.albumMetaBullet}>•</span>
                <span className={styles.albumMetaSub} style={{ color: 'var(--text-subdued)' }}>{getTotalDuration()}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className={styles.actionControls} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {!isYoutube ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              className={styles.playCircleLg} 
              onClick={handlePlayAlbumClick}
              title={isCurrentAlbumPlaying ? 'Pausar' : 'Tocar álbum'}
              disabled={albumTracks.length === 0}
            >
              {isCurrentAlbumPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />}
            </button>
            {window.electronAPI?.exportPlaylist && albumTracks.length > 0 && (
              <button
                className={styles.exportAlbumBtn}
                onClick={handleExportAlbum}
                disabled={isExporting}
              >
                <FolderUp size={14} className={isExporting ? 'spinning' : ''} style={{ animation: isExporting ? 'spin 1.5s infinite linear' : 'none' }} />
                {isExporting ? 'Exportando...' : 'Exportar Álbum'}
              </button>
            )}
            {albumTracks.length > 0 && (
              <button
                className={styles.exportAlbumBtn}
                onClick={() => deleteAlbum(albumName)}
                style={{ color: '#e91429', borderColor: '#e91429' }}
              >
                <Trash2 size={14} />
                Excluir Álbum
              </button>
            )}
          </div>
        ) : (
          <button 
            className={styles.playBtnGreen}
            onClick={handleDownloadFullAlbum}
            disabled={loadingOnline || onlineTracks.length === 0}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              height: '48px', 
              padding: '0 32px', 
              fontSize: '15px', 
              fontWeight: 700, 
              borderRadius: '24px' 
            }}
          >
            <Download size={18} />
            Baixar Álbum Completo
          </button>
        )}
      </div>

      {/* Tracks Table */}
      {isYoutube ? (
        loadingOnline ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <div className="spinner"></div>
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
                const localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === track.videoId);
                const isDownloaded = !!localMatch;
                const queueItem = downloadQueue.find(q => q.videoId === track.videoId);
                const status = isDownloaded ? 'completed' : (queueItem ? queueItem.status : 'idle');
                const isTrackPlaying = localMatch && currentTrack?.id === localMatch.id && isPlaying;

                return (
                  <tr 
                    key={track.videoId} 
                    className={`${styles.trackRow} ${isTrackPlaying ? styles.active : ''}`}
                    onClick={() => {
                      if (isDownloaded) {
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
                            {track.artist?.name || albumArtist}
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
                        ) : isDownloaded ? (
                          <Check size={16} color="var(--spotify-green)" />
                        ) : status === 'error' ? (
                          <span title="Erro no download"><AlertCircle size={16} color="#e91429" /></span>
                        ) : (
                          <button 
                            className="add-to-playlist-btn"
                            onClick={() => addTracksToDownloadQueue([{
                              videoId: track.videoId,
                              name: track.name,
                              artist: track.artist?.name || albumArtist,
                              album: albumName,
                              coverUrl: albumCover || (track.thumbnails && track.thumbnails.length > 0 ? track.thumbnails[track.thumbnails.length - 1].url : ''),
                              duration: track.duration || null,
                              year: viewParams.year || null
                            }])}
                            title="Baixar música"
                          >
                            <Download size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : (
        <table className={styles.tracksTable}>
          <thead>
            <tr>
              <th className={styles.trackRowNum}>#</th>
              <th>Título</th>
              <th className={styles.trackRowDuration}><Clock size={16} /></th>
              <th style={{ width: '50px' }}></th>
            </tr>
          </thead>
          <tbody>
            {albumTracks.map((track, idx) => {
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
                      <div className={styles.trackRowDetails}>
                        <span className={styles.trackRowTitle}>{track.title}</span>
                        <span className={styles.trackRowArtist} style={{ color: isActive ? 'var(--spotify-green)' : 'inherit' }}>
                          {track.artist}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className={styles.trackRowDuration}>
                    {formatDuration(track.duration)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                      <button 
                        className="add-to-playlist-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTrackDropdown(activeTrackDropdown === track.id ? null : track.id);
                        }}
                        title="Opções"
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
      {isExporting && exportProgress && (
        <div className="system-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="system-modal-container" style={{ width: '400px', textAlign: 'center', padding: '30px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>Exportando Álbum</h3>
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

