import React from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { Trash2, ChevronUp, ChevronDown, Clock, Disc, Play } from 'lucide-react';
import styles from '../styles/QueueView.module.css';
import type { Track } from '../../../shared/types';

export const QueueView: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    queue,
    queueIndex,
    playTrack,
    togglePlay,
    removeFromQueue,
    clearQueue,
    reorderQueue
  } = useMediaLibrary();

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleQueueTrackClick = (track: Track) => {
    playTrack(track, queue);
  };

  const handleTrackKeyDown = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  // Get only the tracks after the current track in the queue
  const nextTracks = queueIndex >= 0 ? queue.slice(queueIndex + 1) : [];

  return (
    <div className={styles.queueViewContainer}>
      <div className={styles.queueHeaderRow}>
        <h1 className={styles.sectionTitle}>Fila de reprodução</h1>
        {nextTracks.length > 0 && (
          <button className={styles.clearQueueBtn} onClick={clearQueue}>
            Limpar fila
          </button>
        )}
      </div>

      {/* Now Playing Section */}
      <div className={styles.queueSection}>
        <h2 className={styles.queueSectionTitle}>Tocando agora</h2>
        {currentTrack ? (
          <table className={styles.tracksTable}>
            <tbody>
              <tr className={`${styles.trackRow} ${styles.active}`} onClick={togglePlay} onKeyDown={(event) => handleTrackKeyDown(event, togglePlay)} tabIndex={0} role="button" aria-label={`${isPlaying ? 'Pausar' : 'Tocar'} ${currentTrack.title}`}>
                <td className={styles.trackRowNum} style={{ color: 'var(--spotify-green)', width: '40px' }}>
                  {isPlaying ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>
                    </div>
                  ) : (
                    <Play size={14} fill="currentColor" />
                  )}
                </td>
                <td>
                  <div className={styles.trackRowTitleCol}>
                    {currentTrack.coverArt ? (
                      <img src={currentTrack.coverArt} alt={currentTrack.title} className={styles.trackRowArt} />
                    ) : (
                      <div className={styles.trackRowArt} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                        <Disc size={18} color="#727272" />
                      </div>
                    )}
                    <div className={styles.trackRowDetails}>
                      <span className={styles.trackRowTitle}>{currentTrack.title}</span>
                      <span className={styles.trackRowArtist} style={{ color: 'var(--spotify-green)' }}>
                        {currentTrack.artist}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={styles.trackRowAlbum}>{currentTrack.album}</span>
                </td>
                <td className={styles.trackRowDuration} style={{ width: '80px' }}>
                  {formatDuration(currentTrack.duration)}
                </td>
                <td style={{ width: '120px' }}></td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className={styles.noTracksMessage}>
            Nenhuma música está tocando no momento.
          </div>
        )}
      </div>

      {/* Next Up Section */}
      <div className={styles.queueSection} style={{ marginTop: '30px' }}>
        <h2 className={styles.queueSectionTitle}>Próximo na fila</h2>
        {nextTracks.length === 0 ? (
          <div className={styles.noTracksMessage}>
            Sua fila está vazia. Adicione músicas à fila a partir do menu "..." das faixas.
          </div>
        ) : (
          <table className={styles.tracksTable}>
            <thead>
              <tr>
                <th className={styles.trackRowNum}>#</th>
                <th>Título</th>
                <th>Álbum</th>
                <th className={styles.trackRowDuration}><Clock size={16} /></th>
                <th style={{ width: '120px', textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {nextTracks.map((track, relativeIdx) => {
                // The absolute index in the queue array
                const absoluteIdx = queueIndex + 1 + relativeIdx;

                return (
                  <tr 
                    key={`${track.id}_q_${absoluteIdx}`} 
                    className={styles.trackRow}
                    onClick={() => handleQueueTrackClick(track)}
                    onKeyDown={(event) => handleTrackKeyDown(event, () => handleQueueTrackClick(track))}
                    tabIndex={0}
                    role="button"
                    aria-label={`Tocar ${track.title}, de ${track.artist}`}
                  >
                    <td className={styles.trackRowNum}>{relativeIdx + 1}</td>
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
                          <span className={styles.trackRowArtist}>{track.artist}</span>
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
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                        {/* Move Up */}
                        <button 
                          className={styles.queueActionBtn}
                          disabled={relativeIdx === 0}
                          onClick={() => reorderQueue(absoluteIdx, absoluteIdx - 1)}
                          aria-label={`Mover ${track.title} para cima`}
                          title="Mover para cima"
                        >
                          <ChevronUp size={16} />
                        </button>

                        {/* Move Down */}
                        <button 
                          className={styles.queueActionBtn}
                          disabled={relativeIdx === nextTracks.length - 1}
                          onClick={() => reorderQueue(absoluteIdx, absoluteIdx + 1)}
                          aria-label={`Mover ${track.title} para baixo`}
                          title="Mover para baixo"
                        >
                          <ChevronDown size={16} />
                        </button>

                        {/* Remove */}
                        <button 
                          className={`${styles.queueActionBtn} ${styles.delete}`}
                          onClick={() => removeFromQueue(absoluteIdx)}
                          aria-label={`Remover ${track.title} da fila`}
                          title="Remover da fila"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
