import React, { useEffect, useState } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { Play, Pause, Clock, Disc, User, MoreHorizontal, ArrowLeft } from 'lucide-react';
import { getDominantColor } from '../../../utils/colorExtractor';
import type { Track } from '../../../shared/types';
import { TrackMenuDropdown } from '../../../components/ui/TrackMenuDropdown';
import styles from '../styles/ArtistView.module.css';

export const ArtistView: React.FC = () => {
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

  const artistName = viewParams.name || '';
  const artistTracks = tracks
    .filter(t => t.artist.toLowerCase() === artistName.toLowerCase())
    .sort((a, b) => a.title.localeCompare(b.title));

  const firstTrack = artistTracks[0];

  useEffect(() => {
    if (firstTrack && firstTrack.coverArt) {
      getDominantColor(firstTrack.coverArt).then(color => {
        document.documentElement.style.setProperty('--theme-color', color);
      });
    } else {
      document.documentElement.style.setProperty('--theme-color', 'rgb(83, 83, 83)');
    }
    
    return () => {
      document.documentElement.style.setProperty('--theme-color', 'rgb(83, 83, 83)');
    };
  }, [artistName, firstTrack]);

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleRowClick = (track: Track) => {
    if (currentTrack && currentTrack.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, artistTracks);
    }
  };

  const handlePlayArtistClick = () => {
    if (artistTracks.length === 0) return;
    
    const isPlayingFromThisArtist = currentTrack && artistTracks.some(t => t.id === currentTrack.id);
    if (isPlayingFromThisArtist) {
      togglePlay();
    } else {
      playTrack(artistTracks[0], artistTracks);
    }
  };

  const isCurrentArtistPlaying = isPlaying && currentTrack && artistTracks.some(t => t.id === currentTrack.id);

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

      {/* Artist Info Header */}
      <div className={styles.albumHeaderContainer}>
        {firstTrack && firstTrack.coverArt ? (
          <img src={firstTrack.coverArt} alt={artistName} className={styles.albumCoverLg} style={{ borderRadius: '50%' }} />
        ) : (
          <div className={styles.albumCoverLg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828', borderRadius: '50%' }}>
            <User size={96} color="#727272" />
          </div>
        )}

        <div className={styles.albumInfoContainer}>
          <span className={styles.albumTag}>Artista</span>
          <h1 className={styles.albumTitleLg}>{artistName}</h1>
          <div className={styles.albumMeta}>
            <span className={styles.albumMetaSub}>{artistTracks.length} músicas locais</span>
          </div>
        </div>
      </div>

      {/* Play control */}
      <div className={styles.actionControls}>
        <button 
          className={styles.playCircleLg} 
          onClick={handlePlayArtistClick}
          title={isCurrentArtistPlaying ? 'Pausar' : 'Tocar músicas'}
          disabled={artistTracks.length === 0}
        >
          {isCurrentArtistPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />}
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
          {artistTracks.map((track, idx) => {
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
