import React, { useState } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { Play, Pause, Rewind, FastForward, PictureInPicture2, Disc } from 'lucide-react';
import styles from '../styles/MiniPlayer.module.css';

export const MiniPlayer: React.FC = () => {
  const { 
    currentTrack, 
    isPlaying, 
    togglePlay, 
    playNext, 
    playPrev,
    currentTime,
    duration,
    seek,
    exitMiniPlayer
  } = useMediaLibrary();

  const [isHovered, setIsHovered] = useState(false);

  // Format time (e.g. 00:54 or -03:07)
  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity || time < 0) return '00:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const pad = (num: number) => num < 10 ? `0${num}` : num;
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = clickX / width;
    const newTime = percentage * (duration || 0);
    seek(newTime);
  };

  return (
    <div 
      className={styles.content}
      role="region"
      aria-label="Mini Player"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={exitMiniPlayer}
    >
      {/* Cover Art */}
      <div className={styles.coverWrapper}>
        {currentTrack?.coverArt ? (
          <img src={currentTrack.coverArt} alt={currentTrack.title} className={styles.coverArt} />
        ) : (
          <div className={styles.coverArtPlaceholder}>
            <Disc size={28} color="rgba(255,255,255,0.3)" />
          </div>
        )}
        
        {/* Restore Button overlay on hover */}
        <button
          type="button"
          className={styles.restoreOverlayBtn} 
          style={{ opacity: isHovered ? 1 : 0 }} 
          onClick={(e) => {
            e.stopPropagation();
            exitMiniPlayer();
          }}
          title="Restaurar tamanho"
          aria-label="Restaurar tamanho do player"
        >
          <PictureInPicture2 size={16} />
        </button>
      </div>

      {/* Main Info & Controls Column */}
      <div className={styles.mainCol}>
        {/* Top Info Row */}
        <div className={styles.infoRow}>
          <div className={styles.metaInfo}>
            <div className={styles.title} title={currentTrack?.title || 'Sem título'}>
              {currentTrack?.title || 'Sem título'}
            </div>
            <div className={styles.artist} title={`${currentTrack?.artist || 'Artista desconhecido'}${currentTrack?.album ? ` – ${currentTrack.album}` : ''}`}>
              {currentTrack?.artist || 'Artista desconhecido'}
              {currentTrack?.album ? ` – ${currentTrack.album}` : (currentTrack?.year ? ` – ${currentTrack.year}` : '')}
            </div>
          </div>
          
          {/* Soundwave equalizer */}
          <div className={`${styles.soundwave} ${isPlaying ? styles.soundwaveActive : ''}`}>
            <div className={`${styles.soundwaveBar} ${styles.bar1}`}></div>
            <div className={`${styles.soundwaveBar} ${styles.bar2}`}></div>
            <div className={`${styles.soundwaveBar} ${styles.bar3}`}></div>
            <div className={`${styles.soundwaveBar} ${styles.bar4}`}></div>
            <div className={`${styles.soundwaveBar} ${styles.bar5}`}></div>
          </div>
        </div>

        {/* Controls Row */}
        <div className={styles.controls}>
          <button className={styles.controlBtn} onClick={playPrev} aria-label="Faixa anterior" title="Anterior">
            <Rewind size={18} fill="currentColor" />
          </button>
          
          <button className={`${styles.controlBtn} ${styles.controlBtnPlayPause}`} onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Tocar'} title={isPlaying ? 'Pausar' : 'Tocar'}>
            {isPlaying ? (
              <Pause size={20} fill="currentColor" stroke="none" />
            ) : (
              <Play size={20} fill="currentColor" stroke="none" style={{ marginLeft: '1px' }} />
            )}
          </button>
          
          <button className={styles.controlBtn} onClick={playNext} aria-label="Próxima faixa" title="Próxima">
            <FastForward size={18} fill="currentColor" />
          </button>
        </div>

        {/* Progress Slider Row */}
        <div className={styles.progressSection}>
          <div className={styles.sliderTrack} onClick={handleProgressBarClick} role="progressbar" aria-label="Posição da música" aria-valuemin={0} aria-valuemax={Math.round(duration || 0)} aria-valuenow={Math.round(currentTime)}>
            <div className={styles.sliderFill} style={{ width: `${progressPercent}%` }}></div>
          </div>
          <div className={styles.timeRow}>
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(duration - currentTime)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

