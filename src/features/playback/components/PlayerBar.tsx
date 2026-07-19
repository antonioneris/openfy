import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat,
  Volume2, Volume1, VolumeX, Mic2, Maximize2, PictureInPicture2, Disc, ListMusic, MoreHorizontal,
  Cast, Tv, RefreshCw, Loader2, CheckCircle2, XCircle, MonitorPlay
} from 'lucide-react';
import { TrackMenuDropdown } from '../../../components/ui/TrackMenuDropdown';
import styles from '../styles/PlayerBar.module.css';

interface CastDevice {
  name: string;
  host: string;
  port: number;
  id: string;
}

export const PlayerBar: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffle,
    repeatMode,
    currentView,
    setView,
    goBack,
    togglePlay,
    playNext,
    playPrev,
    seek,
    changeVolume,
    toggleShuffle,
    toggleRepeatMode,
    triggerNativeAirPlay,
    setIsCasting,
    enterMiniPlayer
  } = useMediaLibrary();

  const [localVolume, setLocalVolume] = useState(volume);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [localIp, setLocalIp] = useState('localhost');

  // Chromecast device discovery state
  const [castDevices, setCastDevices] = useState<CastDevice[]>([]);
  const [castScanning, setCastScanning] = useState(false);
  const [castDiscoveryError, setCastDiscoveryError] = useState('');
  const [castingDevice, setCastingDevice] = useState<string | null>(null); // device id being cast to
  const [castStatus, setCastStatus] = useState<{ [id: string]: 'idle' | 'casting' | 'connected' | 'error' }>({});
  const castOpenedRef = useRef(false);

  useEffect(() => {
    if (window.electronAPI?.getLocalIp) {
      window.electronAPI.getLocalIp().then(setLocalIp);
    }
  }, []);

  useEffect(() => {
    setLocalVolume(volume);
  }, [volume]);

  // Load devices when cast modal opens
  useEffect(() => {
    if (isCastOpen && !castOpenedRef.current) {
      castOpenedRef.current = true;
      loadCastDevices();
    }
    if (!isCastOpen) {
      castOpenedRef.current = false;
    }
  }, [isCastOpen]);

  const loadCastDevices = async () => {
    if (!window.electronAPI?.castGetDevices) return;
    setCastScanning(true);
    setCastDiscoveryError('');
    try {
      const devices = await window.electronAPI.castGetDevices();
      setCastDevices(devices);
    } catch (err) {
      console.warn('Failed to get cast devices:', err);
      setCastDiscoveryError('Não foi possível procurar dispositivos. Verifique a rede e tente novamente.');
    } finally {
      setCastScanning(false);
    }
  };

  const handleRescan = async () => {
    if (!window.electronAPI?.castScan) return;
    setCastScanning(true);
    setCastDevices([]);
    setCastDiscoveryError('');
    try {
      const devices = await window.electronAPI.castScan();
      setCastDevices(devices);
    } catch (err) {
      console.warn('Failed to rescan cast devices:', err);
      setCastDiscoveryError('Não foi possível procurar dispositivos. Verifique a rede e tente novamente.');
    } finally {
      setCastScanning(false);
    }
  };


  const handleCastToDevice = async (device: CastDevice) => {
    if (castingDevice === device.id) {
      // Already casting to this device — stop
      try {
        await window.electronAPI?.castStop({ host: device.host, port: device.port });
        setCastingDevice(null);
        setCastStatus(s => ({ ...s, [device.id]: 'idle' }));
        setIsCasting(false);
      } catch (err) {
        console.warn('Failed to stop cast:', err);
      }
      return;
    }

    setCastStatus(s => ({ ...s, [device.id]: 'casting' }));
    setCastingDevice(device.id);
    try {
      await window.electronAPI?.castToDevice({ host: device.host, port: device.port });
      setCastStatus(s => ({ ...s, [device.id]: 'connected' }));
      setIsCasting(true);
    } catch (err: any) {
      console.error('Cast failed:', err);
      setCastStatus(s => ({ ...s, [device.id]: 'error' }));
      setCastingDevice(null);
      setIsCasting(false);
    }
  };

  const handleCastClick = () => {
    if (window.electronAPI?.isElectron) {
      setIsCastOpen(true);
      return;
    }

    const isSafariAirPlayAvailable = typeof (window as any).WebKitPlaybackTargetAvailabilityEvent !== 'undefined';
    if (isSafariAirPlayAvailable) {
      triggerNativeAirPlay();
      return;
    }

    const isCastSDKAvailable = (window as any).cast && (window as any).cast.framework;
    if (isCastSDKAvailable) {
      try {
        (window as any).cast.framework.CastContext.getInstance().requestSession();
      } catch (err) {
        console.warn("Failed to request Google Cast session:", err);
      }
      return;
    }

    alert("Transmissão nativa não suportada neste navegador. Para transmitir para Chromecast ou Apple TV, use o Google Chrome ou Safari.");
  };

  // Format time in seconds to m:ss
  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalVolume(val);
    changeVolume(val);
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      changeVolume(0);
    } else {
      changeVolume(prevVolume > 0 ? prevVolume : 0.5);
    }
  };

  const handleLyricsToggle = () => {
    if (currentView === 'lyrics') {
      goBack();
    } else if (currentTrack) {
      setView('lyrics');
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (event.code === 'Space' && currentTrack) {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft' && currentTrack) {
        event.preventDefault();
        seek(Math.max(0, currentTime - 5));
      } else if (event.key === 'ArrowRight' && currentTrack) {
        event.preventDefault();
        seek(Math.min(duration || currentTime + 5, currentTime + 5));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        changeVolume(Math.max(0, volume - 0.05));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        changeVolume(Math.min(1, volume + 0.05));
      } else if (key === 'm') {
        toggleMute();
      } else if (key === 'q') {
        setView(currentView === 'queue' ? 'home' : 'queue');
      } else if (key === 'l' && currentTrack) {
        handleLyricsToggle();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [currentTrack, currentTime, currentView, duration, volume]);

  const getDeviceStatusIcon = (device: CastDevice) => {
    const status = castStatus[device.id] || 'idle';
    if (castingDevice === device.id && status === 'casting') return <Loader2 size={16} className="spin" style={{ color: 'var(--spotify-green)' }} />;
    if (status === 'connected') return <CheckCircle2 size={16} style={{ color: 'var(--spotify-green)' }} />;
    if (status === 'error') return <XCircle size={16} style={{ color: '#ff4444' }} />;
    return null;
  };

  return (
    <div className={styles.playerBar} role="region" aria-label="Reprodutor de áudio">
      {/* Current Song metadata */}
      <div className={styles.trackInfo}>
        {currentTrack ? (
          <>
            {currentTrack.coverArt ? (
              <img 
                src={currentTrack.coverArt} 
                alt={currentTrack.title} 
                className={styles.trackArt}
                onClick={handleLyricsToggle}
                style={{ cursor: 'pointer' }}
              />
            ) : (
              <div 
                className={styles.trackArt} 
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}
                onClick={handleLyricsToggle}
              >
                <Disc size={24} color="#727272" />
              </div>
            )}
            <div className={styles.trackMeta}>
              <div className={styles.trackTitle} onClick={handleLyricsToggle}>
                {currentTrack.title}
              </div>
              <div className={styles.trackArtist}>
                {currentTrack.artist}
              </div>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: '12px' }} onClick={(e) => e.stopPropagation()}>
              <button 
                className="add-to-playlist-btn"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-label="Abrir opções da música atual"
                aria-expanded={isDropdownOpen}
                title="Opções da música atual"
              >
                <MoreHorizontal size={16} />
              </button>
              {isDropdownOpen && (
                <TrackMenuDropdown 
                  trackId={currentTrack.id} 
                  onClose={() => setIsDropdownOpen(false)} 
                />
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '14px', color: 'var(--text-subdued)' }}>
            Nenhuma música tocando
          </div>
        )}
      </div>

      {/* Main playback control panel */}
      <div className={styles.controls}>
        <div className={styles.controlButtons}>
          <button 
            className={`${styles.controlBtn} ${isShuffle ? styles.active : ''}`} 
            onClick={toggleShuffle}
            aria-label="Alternar ordem aleatória"
            aria-pressed={isShuffle}
            title="Ordem aleatória"
          >
            <Shuffle size={16} />
          </button>
          
          <button 
            className={styles.controlBtn} 
            onClick={playPrev}
            disabled={!currentTrack}
            aria-label="Faixa anterior"
            title="Anterior"
          >
            <SkipBack size={20} />
          </button>

          <button 
            className={`${styles.controlBtn} ${styles.playPause}`} 
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pausar' : 'Tocar'}
            aria-keyshortcuts="Space"
            title={isPlaying ? 'Pausar' : 'Tocar'}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
          </button>

          <button 
            className={styles.controlBtn} 
            onClick={playNext}
            disabled={!currentTrack}
            aria-label="Próxima faixa"
            title="Próxima"
          >
            <SkipForward size={20} />
          </button>

          <button 
            className={`${styles.controlBtn} ${repeatMode !== 'none' ? styles.active : ''}`} 
            onClick={toggleRepeatMode}
            aria-label={repeatMode === 'one' ? 'Repetir uma faixa' : repeatMode === 'all' ? 'Repetir todas as faixas' : 'Ativar repetição'}
            aria-pressed={repeatMode !== 'none'}
            title={repeatMode === 'one' ? 'Repetir uma' : repeatMode === 'all' ? 'Repetir tudo' : 'Repetir desativado'}
          >
            {repeatMode === 'one' ? (
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Repeat size={16} />
                <span style={{ position: 'absolute', fontSize: '8px', fontWeight: 'bold', top: '-4px', right: '-4px', backgroundColor: 'var(--spotify-green)', color: 'black', borderRadius: '50%', width: '10px', height: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
              </span>
            ) : (
              <Repeat size={16} />
            )}
          </button>
        </div>

        {/* Timeline seek progress bar */}
        <div className={styles.progressContainer}>
          <span>{formatTime(currentTime)}</span>
          <div className={styles.sliderWrapper}>
            <input 
              type="range" 
              min={0} 
              max={duration || 100} 
              value={currentTime} 
              onChange={handleSeekChange}
              className={styles.sliderInput}
              disabled={!currentTrack}
              aria-label="Posição da música"
              aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
            />
            <div className={styles.sliderTrack}>
              <div className={styles.sliderFill} style={{ width: `${progressPercent}%` }}></div>
            </div>
            <div className={styles.sliderThumb} style={{ left: `${progressPercent}%` }}></div>
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Auxiliary settings (volume, lyrics, fullscreen) */}
      <div className={styles.playerRight}>
        <button 
          className={`${styles.controlBtn} ${currentView === 'lyrics' ? styles.active : ''}`}
          onClick={handleLyricsToggle}
          disabled={!currentTrack}
          aria-label="Mostrar letras da música"
          aria-pressed={currentView === 'lyrics'}
          aria-keyshortcuts="L"
          title="Letras da música"
        >
          <Mic2 size={16} />
        </button>

        <button 
          className={`${styles.controlBtn} ${currentView === 'queue' ? styles.active : ''}`}
          onClick={() => setView(currentView === 'queue' ? 'home' : 'queue')}
          aria-label="Mostrar fila de reprodução"
          aria-pressed={currentView === 'queue'}
          aria-keyshortcuts="Q"
          title="Fila de reprodução"
        >
          <ListMusic size={16} />
        </button>

        <div className={styles.volumeContainer}>
          <button className={styles.controlBtn} onClick={toggleMute} aria-label={localVolume === 0 ? 'Ativar som' : 'Silenciar'} aria-keyshortcuts="M" title={localVolume === 0 ? 'Ativar som' : 'Silenciar'}>
            {localVolume === 0 ? <VolumeX size={18} /> : localVolume < 0.4 ? <Volume1 size={18} /> : <Volume2 size={18} />}
          </button>
          <div className={styles.sliderWrapper} style={{ width: '100px' }}>
            <input 
              type="range" 
              min={0} 
              max={1} 
              step={0.01}
              value={localVolume} 
              onChange={handleVolumeChange}
              className={styles.sliderInput}
              aria-label="Volume"
              aria-valuetext={`${Math.round(localVolume * 100)}%`}
            />
            <div className={styles.sliderTrack}>
              <div className={styles.sliderFill} style={{ width: `${localVolume * 100}%` }}></div>
            </div>
            <div className={styles.sliderThumb} style={{ left: `${localVolume * 100}%` }}></div>
          </div>
        </div>

        {currentTrack && (
          <button 
            className={`${styles.controlBtn} ${isCastOpen || castingDevice ? styles.active : ''}`} 
            onClick={handleCastClick}
            aria-label="Transmitir para TV ou dispositivo"
            aria-expanded={isCastOpen}
            title="Transmitir para TV / Dispositivo"
            style={castingDevice ? { color: 'var(--spotify-green)' } : undefined}
          >
            <Cast size={18} />
          </button>
        )}

        {currentTrack && (
          <button 
            className={styles.controlBtn} 
            onClick={enterMiniPlayer}
            aria-label="Abrir Mini Player"
            title="Minimizar para Mini Player"
          >
            <PictureInPicture2 size={16} />
          </button>
        )}

        {currentTrack && (
          <button 
            className={styles.controlBtn} 
            onClick={() => setView('fullscreen')}
            aria-label="Abrir tela cheia"
            title="Tela cheia"
          >
            <Maximize2 size={16} />
          </button>
        )}


        {/* CAST DEVICE PICKER MODAL */}
        {isCastOpen && createPortal((
          <div className="system-modal-overlay" style={{ zIndex: 9999 }} onClick={() => setIsCastOpen(false)}>
            <div 
              className="system-modal-container" 
              role="dialog"
              aria-modal="true"
              aria-labelledby="cast-dialog-title"
              style={{ maxWidth: '440px', padding: '0', overflow: 'hidden', borderRadius: '12px' }} 
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ 
                padding: '20px 24px 16px', 
                background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MonitorPlay size={22} color="var(--spotify-green)" />
                  <span id="cast-dialog-title" style={{ fontWeight: '700', fontSize: '16px' }}>Transmitir para dispositivo</span>
                </div>
                <button 
                  onClick={() => setIsCastOpen(false)}
                  aria-label="Fechar seleção de dispositivo"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>

              {/* Device List */}
              <div style={{ padding: '16px 24px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: '12px'
                }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600' }}>
                    Dispositivos na Rede
                  </span>
                  <button
                    onClick={handleRescan}
                    disabled={castScanning}
                    aria-label={castScanning ? 'Procurando dispositivos' : 'Procurar dispositivos novamente'}
                    style={{ 
                      background: 'none', border: 'none', cursor: castScanning ? 'default' : 'pointer',
                      color: castScanning ? 'rgba(255,255,255,0.3)' : 'var(--spotify-green)',
                      display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600'
                    }}
                  >
                    <RefreshCw size={13} style={castScanning ? { animation: 'spin 1s linear infinite' } : undefined} />
                    {castScanning ? 'Procurando...' : 'Atualizar'}
                  </button>
                </div>

                {/* Device items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '80px' }}>
                  {castScanning && castDevices.length === 0 && (
                    <div style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                      padding: '24px', color: 'rgba(255,255,255,0.4)', fontSize: '14px'
                    }}>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      Procurando dispositivos Chromecast...
                    </div>
                  )}
                  
                  {!castScanning && !castDiscoveryError && castDevices.length === 0 && (
                    <div style={{ 
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      padding: '20px', color: 'rgba(255,255,255,0.4)', fontSize: '13px', textAlign: 'center'
                    }}>
                      <Tv size={28} color="rgba(255,255,255,0.15)" />
                      <span>Nenhum Chromecast encontrado na rede.</span>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>Certifique-se de estar na mesma rede Wi-Fi.</span>
                    </div>
                  )}

                  {castDiscoveryError && (
                    <div role="alert" style={{ padding: '10px 12px', borderRadius: '6px', background: 'rgba(233, 20, 41, 0.12)', color: '#ff8b98', fontSize: '12px' }}>
                      {castDiscoveryError}
                    </div>
                  )}

                  {castDevices.map(device => {
                    const status = castStatus[device.id] || 'idle';
                    const isCurrentlyCasting = castingDevice === device.id;
                    return (
                      <button
                        key={device.id}
                        onClick={() => handleCastToDevice(device)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          padding: '12px 16px',
                          background: isCurrentlyCasting 
                            ? 'rgba(29, 185, 84, 0.12)' 
                            : 'rgba(255,255,255,0.04)',
                          border: isCurrentlyCasting 
                            ? '1px solid rgba(29, 185, 84, 0.4)' 
                            : '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s',
                          color: 'white'
                        }}
                      >
                        <div style={{ 
                          width: '38px', height: '38px', borderRadius: '50%',
                          background: isCurrentlyCasting ? 'rgba(29,185,84,0.2)' : 'rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <Tv size={18} color={isCurrentlyCasting ? 'var(--spotify-green)' : 'rgba(255,255,255,0.6)'} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {device.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                            {isCurrentlyCasting && status === 'casting' ? 'Conectando...' :
                             isCurrentlyCasting && status === 'connected' ? 'Transmitindo ✓' :
                             status === 'error' ? 'Erro na conexão' :
                             device.host}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {getDeviceStatusIcon(device)}
                          {isCurrentlyCasting && status === 'connected' && (
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', textAlign: 'center' }}>Parar</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer: fallback for Apple TV / AirPlay via browser */}
              <div style={{ 
                padding: '14px 24px', 
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.2)'
              }}>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px', fontWeight: '600' }}>
                  APPLE AIRPLAY / SMART TV
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ 
                    flex: 1, 
                    background: 'rgba(255,255,255,0.04)', 
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.6)',
                    userSelect: 'all',
                    wordBreak: 'break-all'
                  }}>
                    http://{localIp}:8083/cast
                  </div>
                  <button
                    style={{
                      background: 'var(--spotify-green)',
                      color: 'black',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    onClick={() => {
                      window.electronAPI?.openExternal(`http://${localIp}:8083/cast`);
                    }}
                  >
                    Abrir no Chrome
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px', lineHeight: '1.4' }}>
                  Para Apple TV: abra no Safari → compartilhar → AirPlay. Para Smart TV: abra o link no navegador da TV.
                </div>
              </div>
            </div>
          </div>
        ), document.body)}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
