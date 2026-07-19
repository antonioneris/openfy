import React, { useEffect, useState } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { 
  Disc, X, Play, Pause, SkipForward, SkipBack, 
  Shuffle, Repeat, Volume2, VolumeX, Tv, Wifi
} from 'lucide-react';
import { getDominantColor } from '../../../utils/colorExtractor';
import styles from '../styles/FullscreenView.module.css';

export const FullscreenView: React.FC = () => {
  const { 
    currentTrack, 
    currentTime,
    lyrics,
    seek,
    setView,
    isPlaying,
    volume,
    isShuffle,
    repeatMode,
    togglePlay,
    playNext,
    playPrev,
    changeVolume,
    toggleShuffle,
    toggleRepeatMode,
    duration
  } = useMediaLibrary();

  const [bgColor, setBgColor] = useState('rgb(18, 18, 18)');
  const [prevVolume, setPrevVolume] = useState(1);
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [localIp, setLocalIp] = useState('localhost');

  useEffect(() => {
    if (window.electronAPI?.getLocalIp) {
      window.electronAPI.getLocalIp().then(setLocalIp);
    }
  }, []);


  // Extract cover art color and set it as background
  useEffect(() => {
    if (currentTrack && currentTrack.coverArt) {
      getDominantColor(currentTrack.coverArt).then(color => {
        setBgColor(color);
      });
    } else {
      setBgColor('rgb(18, 18, 18)');
    }
  }, [currentTrack]);

  // Request browser fullscreen when view mounts
  useEffect(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn("Navegador impediu a ativação de tela cheia automática:", err);
      });
    }
  }, []);

  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
    setView('home');
  };

  const handleDoubleClick = () => {
    handleExit();
  };

  // Find the active lyric index based on current playback time
  let activeIndex = -1;
  const hasLyrics = lyrics && lyrics.length > 0;
  if (hasLyrics) {
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  // Smoothly scroll the active lyric line to the center of the viewport
  useEffect(() => {
    const activeEl = document.querySelector('.' + styles.fullscreenLyricLine + '.' + styles.active);
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeIndex]);

  // Format progress timeline times
  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      changeVolume(0);
    } else {
      changeVolume(prevVolume);
    }
  };

  return (
    <div 
      className={`${styles.fullscreenTvContainer} ${hasLyrics ? styles.splitLayout : styles.centerLayout}`}
      style={{ backgroundColor: bgColor, '--dominant-color': bgColor } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      {/* Ambient glassmorphic blobs for fluid dynamic background */}
      <div className={styles.fullscreenAmbientBg}>
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
      </div>
      {/* Top right buttons */}
      <div className="fullscreen-top-actions visible" style={{
        position: 'absolute',
        top: '24px',
        right: '24px',
        display: 'flex',
        gap: '12px',
        zIndex: 100
      }}>
        <button 
          className={styles.fullscreenCloseBtn}
          onClick={handleExit} 
          aria-label="Sair da tela cheia"
          title="Sair da tela cheia (ou dê duplo clique)"
          style={{ position: 'static' }}
        >
          <X size={24} />
        </button>
      </div>

      <div className={styles.fullscreenContentGrid}>
        {/* Left Panel: Cover and Info */}
        <div className={styles.fullscreenLeftPanel}>
          <div className={styles.fullscreenCoverWrapper}>
            {currentTrack?.coverArt ? (
              <img 
                src={currentTrack.coverArt} 
                alt={currentTrack.title} 
                className={styles.fullscreenCover}
              />
            ) : (
              <div className={styles.fullscreenCoverPlaceholder}>
                <Disc size={128} color="#727272" />
              </div>
            )}
          </div>

          <div className={styles.fullscreenTrackDetails}>
            <h1 className={styles.fullscreenTitle}>{currentTrack?.title || 'Sem título'}</h1>
            <p className={styles.fullscreenArtist}>
              {currentTrack?.album ? `${currentTrack.album} • ` : ''}
              {currentTrack?.artist || 'Artista Desconhecido'}
            </p>
          </div>
        </div>

        {/* Right Panel: Synchronized Lyrics */}
        {hasLyrics && (
          <div className={styles.fullscreenRightPanel}>
            <div className={styles.fullscreenLyricsScroll}>
              {lyrics.map((line, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={idx}
                    className={`${styles.fullscreenLyricLine} ${isActive ? styles.active : ''}`}
                    onClick={() => seek(line.time)}
                    title={`Pular para ${Math.floor(line.time / 60)}:${Math.floor(line.time % 60).toString().padStart(2, '0')}`}
                  >
                    {line.text || '•••'}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar (Always visible) */}
      <div 
        className={`${styles.fullscreenControlsBar} ${styles.visible}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Shuffle & Repeat toggles */}
        <div className={styles.fullscreenControlsLeft}>
          <button className={styles.fullscreenIconBtn} onClick={toggleShuffle} aria-label="Alternar ordem aleatória" aria-pressed={isShuffle} title="Ordem aleatória">
            <Shuffle size={18} className={isShuffle ? styles['active-green'] : ''} />
          </button>
          <button className={styles.fullscreenIconBtn} onClick={toggleRepeatMode} aria-label="Alternar repetição" aria-pressed={repeatMode !== 'none'} title="Repetir">
            <Repeat size={18} className={repeatMode !== 'none' ? styles['active-green'] : ''} />
            {repeatMode === 'one' && <span className={styles.repeatBadgeOne}>1</span>}
          </button>
        </div>

        {/* Center: Playback controls and progress seek bar */}
        <div className={styles.fullscreenControlsCenter}>
          <div className={styles.fullscreenPlaybackButtons}>
            <button className={styles.fullscreenIconBtn} onClick={playPrev} aria-label="Faixa anterior" title="Anterior">
              <SkipBack size={22} />
            </button>
            <button className={styles.fullscreenPlayPauseBtn} onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Tocar'} title={isPlaying ? 'Pausar' : 'Tocar'}>
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '2px' }} />}
            </button>
            <button className={styles.fullscreenIconBtn} onClick={playNext} aria-label="Próxima faixa" title="Próxima">
              <SkipForward size={22} />
            </button>
          </div>

          <div className={styles.fullscreenProgressContainer}>
            <span>{formatTime(currentTime)}</span>
            <div className="slider-wrapper">
              <input 
                type="range" 
                min={0} 
                max={duration || 100} 
                value={currentTime} 
                onChange={handleProgressChange}
                className="slider-input"
                aria-label="Posição da música"
                aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
              />
              <div className="slider-track">
                <div className="slider-fill" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}></div>
              </div>
              <div className="slider-thumb" style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}></div>
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume slider and mute toggle */}
        <div className={styles.fullscreenControlsRight}>
          <div className={styles.fullscreenVolumeContainer}>
            <button className={styles.fullscreenIconBtn} onClick={toggleMute} aria-label={volume === 0 ? 'Ativar som' : 'Silenciar'} title={volume === 0 ? 'Ativar som' : 'Silenciar'}>
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div className="slider-wrapper" style={{ width: '100px' }}>
              <input 
                type="range" 
                min={0} 
                max={1} 
                step={0.01}
                value={volume} 
                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                className="slider-input"
                aria-label="Volume"
                aria-valuetext={`${Math.round(volume * 100)}%`}
              />
              <div className="slider-track">
                <div className="slider-fill" style={{ width: `${volume * 100}%` }}></div>
              </div>
              <div className="slider-thumb" style={{ left: `${volume * 100}%` }}></div>
            </div>
          </div>
        </div>
        {isCastOpen && (
          <div className="system-modal-overlay" style={{ zIndex: 9999 }} onClick={() => setIsCastOpen(false)}>
            <div className="system-modal-container" style={{ maxWidth: '480px', padding: '24px', background: '#181818', border: '1px solid #282828' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div className="system-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Tv size={24} color="var(--spotify-green)" />
                  <span>Transmitir para TV / Dispositivo</span>
                </div>
                <button 
                  onClick={() => setIsCastOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-subdued)', cursor: 'pointer', fontSize: '18px' }}
                >
                  ✕
                </button>
              </div>
              
              <div className="system-modal-message" style={{ marginBottom: '20px', fontSize: '14.5px', textAlign: 'left', color: 'var(--text-subdued)', lineHeight: '1.4' }}>
                O aplicativo desktop não possui acesso aos menus proprietários de transmissão de rede. Para usar o Chromecast ou Apple TV nativos, abra esta tela em seu navegador padrão de internet:
              </div>

              <button
                className="system-modal-btn primary"
                style={{
                  width: '100%',
                  marginBottom: '20px',
                  backgroundColor: 'var(--spotify-green)',
                  color: 'black',
                  fontWeight: 'bold',
                  padding: '12px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  window.electronAPI?.openExternal(`http://${localIp}:8083/cast`);
                  setIsCastOpen(false);
                }}
              >
                Abrir no Navegador do Sistema (Recomendado)
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--spotify-green)', fontWeight: 'bold', fontSize: '13px', marginBottom: '12px' }}>
                <Wifi size={16} />
                <span>Alternativa: Conectar via Link do Dispositivo</span>
              </div>

              <div style={{
                background: '#121212',
                padding: '12px',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '15px',
                color: '#ffffff',
                border: '1px solid #282828',
                textAlign: 'center',
                userSelect: 'all',
                wordBreak: 'break-all',
                fontWeight: 'bold',
                marginBottom: '20px'
              }}>
                http://{localIp}:8083/cast
              </div>

              <div style={{ textAlign: 'left', fontSize: '12.5px', color: 'var(--text-subdued)', lineHeight: '1.5' }}>
                <strong style={{ color: '#ffffff', display: 'block', marginBottom: '6px' }}>Instruções:</strong>
                <ul style={{ paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>Abra o link no navegador da sua TV ou dispositivo e controle a música pelo aplicativo.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
