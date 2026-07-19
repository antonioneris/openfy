import React, { useEffect } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { X, Mic, Info } from 'lucide-react';
import styles from '../styles/LyricsView.module.css';

export const LyricsView: React.FC = () => {
  const { 
    currentTrack, 
    currentTime, 
    lyrics, 
    goBack 
  } = useMediaLibrary();

  // Find the active lyric index based on current playback time
  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (currentTime >= lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // Smoothly scroll the active lyric line to the center of the viewport
  useEffect(() => {
    const activeEl = document.querySelector(`.${styles.lyricsLine}.${styles.active}`);
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeIndex]);

  // Safe seek handler wrapper
  const seekTo = useMediaLibrary().seek;

  const handleClose = () => {
    goBack();
  };

  return (
    <div className={styles.lyricsViewContainer}>
      {/* Dynamic blurred cover art backdrop */}
      {currentTrack?.coverArt && (
        <div 
          className={styles.lyricsBackdropBlur} 
          style={{ backgroundImage: `url(${currentTrack.coverArt})` }}
        />
      )}
      <div className={styles.lyricsOverlayColor} />

      {/* Header bar */}
      <div className={styles.lyricsHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Mic size={24} color="var(--spotify-green)" />
          <div>
            <div className={styles.lyricsSongTitle}>{currentTrack?.title}</div>
            <div className={styles.lyricsSongArtist}>{currentTrack?.artist}</div>
          </div>
        </div>
        <button className={styles.closeLyricsBtn} onClick={handleClose} title="Fechar letras">
          <X size={20} />
        </button>
      </div>

      {/* Scrolling lyrics area */}
      <div className={styles.lyricsContentScroll}>
        {lyrics.length === 0 ? (
          <div className={styles.noLyrics}>
            <Info size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <div>Não há letras sincronizadas disponíveis para esta música.</div>
            <div style={{ fontSize: '14px', fontWeight: 400, marginTop: '12px', color: 'var(--text-subdued)', maxWidth: '400px', margin: '12px auto 0 auto', lineHeight: '1.5' }}>
              Para exibir letras sincronizadas, certifique-se de que há um arquivo <span style={{ color: 'white', fontWeight: 600 }}>.lrc</span> com o mesmo nome da música na mesma pasta.
              <br />
              <span style={{ fontSize: '12px', opacity: 0.8 }}>(Exemplo: "{currentTrack?.fileName.replace(/\.(mp3|m4a)$/i, '')}.lrc")</span>
            </div>
          </div>
        ) : (
          lyrics.map((line, idx) => {
            const isActive = idx === activeIndex;
            return (
              <div
                key={idx}
                className={`${styles.lyricsLine} ${isActive ? styles.active : ''}`}
                onClick={() => seekTo(line.time)}
                title={`Pular para ${Math.floor(line.time / 60)}:${Math.floor(line.time % 60).toString().padStart(2, '0')}`}
              >
                {line.text || '•••'}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
