import React, { useEffect, useState } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { Play, Pause, Clock, Disc, Folder, MoreHorizontal, ArrowLeft } from 'lucide-react';
import { getDominantColor } from '../../../utils/colorExtractor';
import type { Track } from '../../../shared/types';
import { isTrackInFolder } from '../../../utils/libraryEngine';
import { TrackMenuDropdown } from '../../../components/ui/TrackMenuDropdown';
import styles from '../styles/FolderView.module.css';

export const FolderView: React.FC = () => {
  const { 
    tracks, 
    viewParams, 
    currentTrack, 
    isPlaying, 
    playTrack, 
    togglePlay,
    goBack
  } = useMediaLibrary();

  const [activeTrackDropdown, setActiveTrackDropdown] = useState<string | null>(null);

  const folderName = viewParams.name || '';
  const folderDisplayName = folderName.split('/').pop() || folderName;
  const folderTracks = tracks
    .filter(t => isTrackInFolder(t.filePath, folderName))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  const trackWithArt = folderTracks.find(t => !!t.coverArt);

  useEffect(() => {
    if (trackWithArt && trackWithArt.coverArt) {
      getDominantColor(trackWithArt.coverArt).then(color => {
        document.documentElement.style.setProperty('--theme-color', color);
      });
    } else {
      document.documentElement.style.setProperty('--theme-color', 'rgb(83, 83, 83)');
    }
    
    return () => {
      document.documentElement.style.setProperty('--theme-color', 'rgb(83, 83, 83)');
    };
  }, [folderName, trackWithArt]);

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleRowClick = (track: Track) => {
    if (currentTrack && currentTrack.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, folderTracks);
    }
  };

  const handlePlayFolderClick = () => {
    if (folderTracks.length === 0) return;
    
    const isPlayingFromThisFolder = currentTrack && folderTracks.some(t => t.id === currentTrack.id);
    if (isPlayingFromThisFolder) {
      togglePlay();
    } else {
      playTrack(folderTracks[0], folderTracks);
    }
  };

  const isCurrentFolderPlaying = isPlaying && currentTrack && folderTracks.some(t => t.id === currentTrack.id);

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

      {/* Folder Info Header */}
      <div className={styles.albumHeaderContainer}>
        {trackWithArt && trackWithArt.coverArt ? (
          <img src={trackWithArt.coverArt} alt={folderDisplayName} className={styles.albumCoverLg} />
        ) : (
          <div className={styles.albumCoverLg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
            <Folder size={96} color="#727272" />
          </div>
        )}

        <div className={styles.albumInfoContainer}>
          <span className={styles.albumTag}>Pasta Local</span>
          <h1 className={styles.albumTitleLg}>{folderDisplayName}</h1>
          <div className={styles.albumMeta}>
            <span className={styles.albumMetaSub}>{folderTracks.length} músicas importadas</span>
          </div>
        </div>
      </div>

      {/* Play control */}
      <div className={styles.actionControls}>
        <button 
          className={styles.playCircleLg} 
          onClick={handlePlayFolderClick}
          title={isCurrentFolderPlaying ? 'Pausar' : 'Tocar pasta'}
          disabled={folderTracks.length === 0}
        >
          {isCurrentFolderPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />}
        </button>
      </div>

      {/* Tracks Table */}
      <table className={styles.tracksTable}>
        <thead>
          <tr>
            <th className={styles.trackRowNum}>#</th>
            <th>Título</th>
            <th>Álbum</th>
            <th className={styles.trackRowDuration}><Clock size={16} /></th>
            <th style={{ width: '50px' }}></th>
          </tr>
        </thead>
        <tbody>
          {folderTracks.map((track, idx) => {
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
                <td>
                  <span className={styles.trackRowAlbum}>{track.album}</span>
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
    </div>
  );
};
