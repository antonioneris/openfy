import React, { useState, useEffect, useRef } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { 
  FolderPlus, Disc, Play, Settings, Folder, Heart, 
  Clock, Music, User, Download, Loader2, Check, Bell, RotateCw
} from 'lucide-react';
import type { Track } from '../../../shared/types';
import { getYouTubeIdFromTrack, loadCachedLibrary } from '../../../utils/libraryEngine';
import styles from '../styles/HomeView.module.css';

export const HomeView: React.FC = () => {
  const { 
    tracks, 
    folders,
    playlists,
    currentTrack,
    isPlaying,
    setView, 
    playTrack, 
    scanLocalFolder,
    toggleTrackFavorite,
    checkPermissionsAndReload,
    showAlert,
    showConfirm,
    libraryStatus,
    reauthorizeLibraryFolder,
    cancelLibraryScan
  } = useMediaLibrary();

  const categories = [
    "Tudo", "Playlists", "Álbuns", "Artistas", "Gêneros", "Mais tocadas", "Favoritas", "Recentes"
  ];

  const [activeCategory, setActiveCategory] = useState<string>("Tudo");
  const [recommendedPlaylists, setRecommendedPlaylists] = useState<any[]>([]);
  const [isSearchingPlaylists, setIsSearchingPlaylists] = useState(false);
  const [recGenre, setRecGenre] = useState('');

  // YouTube Recommendations state
  const [ytRecs, setYtRecs] = useState<any[]>([]);
  const [recArtist, setRecArtist] = useState<string>('');
  const [isSearchingRecs, setIsSearchingRecs] = useState(false);
  const [downloadStatuses, setDownloadStatuses] = useState<{ [key: string]: 'idle' | 'downloading' | 'completed' | 'error' }>({});

  const lastFetchedArtistRef = useRef<string>('');
  const recsLoadedRef = useRef(false);

  const refreshRecommendations = async () => {
    if (tracks.length === 0 || !window.electronAPI?.searchYouTubeMusic) return;

    // 1. Refresh Smart Mixtapes (Clear cache and regenerate)
    localStorage.removeItem('spotify_home_mixes');
    localStorage.removeItem('spotify_home_mixes_timestamp');
    const freshMixes = getSmartMixtapes();
    setMixtapes(freshMixes);

    // 2. Fetch YouTube song recommendations based on a random top artist (from top 5)
    const artistScores: { [key: string]: number } = {};
    tracks.forEach(t => {
      const art = t.artist;
      if (art && art !== 'Artista Desconhecido') {
        const score = (t.playCount || 0) * 3 + (t.isFavorite ? 10 : 0) + 1;
        artistScores[art] = (artistScores[art] || 0) + score;
      }
    });

    const topArtistsList = Object.entries(artistScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);

    if (topArtistsList.length > 0) {
      const randomArtist = topArtistsList[Math.floor(Math.random() * topArtistsList.length)];
      setRecArtist(randomArtist);
      lastFetchedArtistRef.current = randomArtist;
      fetchYtRecommendations(randomArtist);
    }

    // 3. Fetch recommended playlists based on a random favorite genre (from top 3)
    const genreCounts: { [key: string]: number } = {};
    tracks.forEach(t => {
      if (t.genre) {
        const parts = t.genre.split(',').map(g => g.trim());
        parts.forEach(p => {
          if (p && p.toLowerCase() !== 'gênero desconhecido' && p.toLowerCase() !== 'unknown') {
            const weight = (t.playCount || 0) * 2 + (t.isFavorite ? 5 : 0) + 1;
            genreCounts[p] = (genreCounts[p] || 0) + weight;
          }
        });
      }
    });

    const topGenresList = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);

    const selectedGenre = topGenresList.length > 0
      ? topGenresList[Math.floor(Math.random() * topGenresList.length)]
      : '';

    const query = selectedGenre ? `${selectedGenre} Spotify Playlist` : "Spotify Playlist Hits";
    setRecGenre(selectedGenre || "Hits do Momento");

    setIsSearchingPlaylists(true);
    try {
      const results = await window.electronAPI.searchYouTubeMusic(query);
      if (results && results.playlists && results.playlists.length > 0) {
        setRecommendedPlaylists(results.playlists.slice(0, 5));
      } else {
        setRecommendedPlaylists([]);
      }
    } catch (err) {
      console.error('Failed to search recommended playlists:', err);
    } finally {
      setIsSearchingPlaylists(false);
    }
  };

  // Background YouTube recommendation search based on user taste (initial load)
  useEffect(() => {
    if (tracks.length === 0 || recsLoadedRef.current || !window.electronAPI?.searchYouTubeMusic) return;
    recsLoadedRef.current = true;
    refreshRecommendations();
  }, [tracks]);

  const fetchYtRecommendations = async (artist: string) => {
    setIsSearchingRecs(true);
    try {
      const res = await window.electronAPI!.searchYouTubeMusic(artist);
      if (res && res.songs) {
        // Filter out songs already in local library
        const filtered = res.songs.filter((song: any) => {
          return !tracks.some(t => getYouTubeIdFromTrack(t) === song.videoId);
        });
        setYtRecs(filtered.slice(0, 6)); // show top 6 recommended songs
      }
    } catch (err) {
      console.warn('Failed to load YouTube recommendations for Home:', err);
    } finally {
      setIsSearchingRecs(false);
    }
  };

  const handleRecClick = async (item: any) => {
    const localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === item.videoId);
    if (localMatch) {
      playTrack(localMatch, [localMatch]);
    } else {
      const confirmed = await showConfirm(
        'Baixar e Ouvir',
        `A música "${item.name}" não está na sua biblioteca. Deseja fazer o download e reproduzi-la agora?`
      );
      if (confirmed) {
        handleDownload(item, true);
      }
    }
  };

  const handleDownload = async (item: any, autoPlay: boolean = false) => {
    // Check if it already exists in the library
    const localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === item.videoId);
    if (localMatch) {
      showAlert('Música Já Baixada', `A música "${item.name}" já está na sua biblioteca.`);
      setDownloadStatuses(prev => ({ ...prev, [item.videoId]: 'completed' }));
      return;
    }

    const downloadDir = folders[0] || '';
    if (!downloadDir || downloadDir.trim() === '') {
      showAlert(
        'Pasta de Biblioteca Necessária', 
        'Por favor, vá em Configurações e adicione pelo menos uma Pasta da Biblioteca antes de iniciar.'
      );
      return;
    }

    setDownloadStatuses(prev => ({ ...prev, [item.videoId]: 'downloading' }));

    try {
      const response = await window.electronAPI!.downloadSong({
        id: item.videoId,
        title: item.name,
        artist: item.artist?.name || 'Artista Desconhecido',
        album: item.album?.name || 'Singles',
        coverUrl: item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[item.thumbnails.length - 1].url : '',
        duration: item.duration || null,
        downloadDir: downloadDir
      });

      if (response && response.status === 'success') {
        setDownloadStatuses(prev => ({ ...prev, [item.videoId]: 'completed' }));
        // Trigger library scan
        await checkPermissionsAndReload();

        if (autoPlay) {
          setTimeout(async () => {
            const freshTracks = await loadCachedLibrary();
            const matchingTrack = freshTracks.find(t => getYouTubeIdFromTrack(t) === item.videoId);
            if (matchingTrack) {
              playTrack(matchingTrack, [matchingTrack]);
            }
          }, 1200);
        }
      } else {
        setDownloadStatuses(prev => ({ ...prev, [item.videoId]: 'error' }));
        showAlert('Erro no Download', 'Ocorreu um problema desconhecido durante o download.');
      }
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadStatuses(prev => ({ ...prev, [item.videoId]: 'error' }));
      showAlert(
        'Erro no Download',
        `Não foi possível concluir o download da música. Verifique a conexão e reabra o aplicativo para preparar os componentes do player.\n\nErro: ${err.message || err}`
      );
    }
  };

  // Group tracks by album
  const getAlbums = () => {
    const albumMap: { [key: string]: { title: string; artist: string; coverArt?: string; tracks: Track[] } } = {};
    
    tracks.forEach(track => {
      const key = `${track.album.toLowerCase()}_${track.artist.toLowerCase()}`;
      if (!albumMap[key]) {
        albumMap[key] = {
          title: track.album,
          artist: track.artist,
          coverArt: track.coverArt,
          tracks: []
        };
      }
      if (track.coverArt && !albumMap[key].coverArt) {
        albumMap[key].coverArt = track.coverArt;
      }
      albumMap[key].tracks.push(track);
    });

    return Object.values(albumMap);
  };

  const albums = getAlbums();

  // Group tracks by artist
  const getArtists = () => {
    const artistMap: { [key: string]: { name: string; coverArt?: string; count: number; tracks: Track[] } } = {};
    tracks.forEach(track => {
      const key = track.artist.toLowerCase();
      if (!artistMap[key]) {
        artistMap[key] = {
          name: track.artist,
          coverArt: track.coverArt,
          count: 0,
          tracks: []
        };
      }
      if (track.coverArt && !artistMap[key].coverArt) {
        artistMap[key].coverArt = track.coverArt;
      }
      artistMap[key].count++;
      artistMap[key].tracks.push(track);
    });
    return Object.values(artistMap).sort((a, b) => b.count - a.count);
  };

  const artists = getArtists();

  // Group tracks by genre
  const getGenres = () => {
    const genreMap: { [key: string]: { name: string; count: number; tracks: Track[] } } = {};
    tracks.forEach(track => {
      const genreStr = track.genre || 'Gênero Desconhecido';
      const genresList = genreStr.split(',').map(g => g.trim());
      genresList.forEach(g => {
        if (!g) return;
        const key = g.toLowerCase();
        if (!genreMap[key]) {
          genreMap[key] = {
            name: g,
            count: 0,
            tracks: []
          };
        }
        genreMap[key].count++;
        genreMap[key].tracks.push(track);
      });
    });
    return Object.values(genreMap).sort((a, b) => b.count - a.count);
  };

  const genres = getGenres();


  const handlePlayCollection = (e: React.MouseEvent, collectionTracks: Track[]) => {
    e.stopPropagation();
    if (collectionTracks.length > 0) {
      playTrack(collectionTracks[0], collectionTracks);
    }
  };

  // Dynamic Smart Mixtapes generator based on local database statistics
  const getSmartMixtapes = () => {
    if (tracks.length === 0) return [];
    
    // 1. Supermix: favorites + highly played
    const favorites = tracks.filter(t => t.isFavorite);
    const highlyPlayed = [...tracks].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 15);
    const supermixTracks = Array.from(new Set([...favorites, ...highlyPlayed])).slice(0, 30);
    
    // 2. Mix Descobertas: 0 or very low play count
    const unplayed = tracks.filter(t => !t.playCount || t.playCount === 0);
    const discoveryTracks = unplayed.length > 0 
      ? unplayed.sort(() => 0.5 - Math.random()).slice(0, 20)
      : tracks.sort(() => 0.5 - Math.random()).slice(0, 20);
      
    // 3. Mix Energético: Upbeat genres
    const upbeatGenres = ['rock', 'metal', 'pop', 'dance', 'electronic', 'grunge', 'industrial', 'punk', 'alternative'];
    const energeticTracks = tracks.filter(t => {
      const g = (t.genre || '').toLowerCase();
      return upbeatGenres.some(genre => g.includes(genre));
    }).sort(() => 0.5 - Math.random()).slice(0, 20);
    
    // 4. Mix Relax: Chill genres
    const chillGenres = ['acoustic', 'jazz', 'classical', 'folk', 'blues', 'chill', 'ambient', 'soft', 'indie', 'soul'];
    const relaxTracks = tracks.filter(t => {
      const g = (t.genre || '').toLowerCase();
      return chillGenres.some(genre => g.includes(genre));
    }).sort(() => 0.5 - Math.random()).slice(0, 20);

    // 5. Mix de Gênero Favorito
    const genreCounts: { [key: string]: number } = {};
    tracks.forEach(t => {
      if (t.genre) {
        const parts = t.genre.split(',').map(g => g.trim());
        parts.forEach(p => {
          if (p) genreCounts[p] = (genreCounts[p] || 0) + 1;
        });
      }
    });
    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topGenreTracks = topGenre
      ? tracks.filter(t => (t.genre || '').includes(topGenre)).sort(() => 0.5 - Math.random()).slice(0, 20)
      : [];

    const list = [
      { name: "Minha Supermix", desc: "Suas músicas favoritas e mais ouvidas em um só lugar.", tracks: supermixTracks.length > 0 ? supermixTracks : tracks.slice(0, 20) },
      { name: "Mix Descobertas", desc: "Músicas que você ainda não ouviu ou ouviu pouco.", tracks: discoveryTracks },
    ];

    if (energeticTracks.length >= 3) {
      list.push({ name: "Mix Energético", desc: "Músicas animadas da sua biblioteca para te dar energia.", tracks: energeticTracks });
    }
    if (relaxTracks.length >= 3) {
      list.push({ name: "Mix Relax", desc: "Músicas tranquilas e relaxantes para focar ou relaxar.", tracks: relaxTracks });
    }
    if (topGenreTracks.length >= 3 && topGenre) {
      list.push({ name: `Mix de ${topGenre}`, desc: `Uma seleção especial do seu gênero favorito: ${topGenre}.`, tracks: topGenreTracks });
    }

    // Decade-based mixes
    const decades: { [key: number]: Track[] } = {};
    tracks.forEach(t => {
      if (t.year && t.year > 1900) {
        const decade = Math.floor(t.year / 10) * 10;
        if (!decades[decade]) decades[decade] = [];
        decades[decade].push(t);
      }
    });

    Object.entries(decades).forEach(([decStr, tList]) => {
      if (tList.length >= 3) {
        list.push({
          name: `Mix Anos ${decStr.slice(2)}`,
          desc: `Relembre o melhor dos anos ${decStr} da sua biblioteca.`,
          tracks: tList.sort(() => 0.5 - Math.random()).slice(0, 20)
        });
      }
    });

    // Fill up to 6 mixes if still short
    let mixNum = 1;
    while (list.length < 6) {
      list.push({
        name: `Minha Mix 0${mixNum}`,
        desc: `Uma combinação personalizada de faixas da sua biblioteca.`,
        tracks: tracks.sort(() => 0.5 - Math.random()).slice(0, 15)
      });
      mixNum++;
    }

    return list.slice(0, 6);
  };

  const [mixtapes, setMixtapes] = useState<{ name: string; desc: string; tracks: Track[] }[]>([]);

  useEffect(() => {
    if (tracks.length === 0) return;

    const CACHE_KEY = 'spotify_home_mixes';
    const CACHE_TIME_KEY = 'spotify_home_mixes_timestamp';
    const cacheTime = localStorage.getItem(CACHE_TIME_KEY);
    const cacheData = localStorage.getItem(CACHE_KEY);

    let useCache = false;
    if (cacheTime && cacheData) {
      const timestamp = parseInt(cacheTime, 10);
      if (Date.now() - timestamp < 24 * 3600 * 1000) {
        useCache = true;
      }
    }

    if (useCache && cacheData) {
      try {
        const parsed = JSON.parse(cacheData) as { name: string; desc: string; trackIds: string[] }[];
        const reconstructed = parsed.map(mix => ({
          name: mix.name,
          desc: mix.desc,
          tracks: mix.trackIds
            .map(id => tracks.find(t => t.id === id))
            .filter((t): t is Track => !!t)
        })).filter(mix => mix.tracks.length > 0);

        if (reconstructed.length >= 2) {
          setMixtapes(reconstructed);
          return;
        }
      } catch (e) {
        console.warn("Error restoring mixtapes cache:", e);
      }
    }

    // Generate fresh and cache
    const freshMixes = getSmartMixtapes();
    setMixtapes(freshMixes);

    try {
      const toCache = freshMixes.map(mix => ({
        name: mix.name,
        desc: mix.desc,
        trackIds: mix.tracks.map(t => t.id)
      }));
      localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch (e) {
      console.warn("Error saving mixtapes cache:", e);
    }
  }, [tracks]);

  // Helper to render 2x2 cover collage for mixtape cards
  const renderMixtapeCover = (mixTracks: Track[], fallbackName: string) => {
    const uniqueCovers = Array.from(new Set(mixTracks.map(t => t.coverArt).filter(Boolean))) as string[];
    
    if (uniqueCovers.length >= 4) {
      return (
        <div className={styles.mixtapeCoverGrid}>
          {uniqueCovers.slice(0, 4).map((cover, i) => (
            <img key={i} src={cover} className={styles.mixtapeCoverGridItem} alt="" />
          ))}
        </div>
      );
    }
    
    if (uniqueCovers.length > 0) {
      return <img src={uniqueCovers[0]} className={styles.cardImg} alt={fallbackName} />;
    }

    return (
      <div className={`${styles.cardImg} ${styles.mixtapeFallbackGradient}`}>
        <span>{fallbackName.replace("Minha ", "")}</span>
      </div>
    );
  };

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const activeScanStatus = libraryStatus.phase === 'refreshing' || libraryStatus.phase === 'scanning'
    ? libraryStatus
    : null;

  if (tracks.length === 0 && ['initializing', 'refreshing', 'selecting', 'scanning'].includes(libraryStatus.phase)) {
    const progress = activeScanStatus?.total
      ? Math.round((activeScanStatus.processed || 0) / activeScanStatus.total * 100)
      : null;
    const loadingMessage = libraryStatus.phase === 'selecting'
      ? 'Aguardando a seleção da pasta…'
      : libraryStatus.phase === 'refreshing' || libraryStatus.phase === 'scanning'
        ? 'Verificando os arquivos da sua biblioteca…'
        : 'Recuperando suas músicas e configurações salvas…';
    return (
      <div className={styles.emptyStateContainer} role="status" aria-live="polite">
        <Loader2 size={48} className={styles.loadingSpinner} />
        <h1 className={styles.emptyStateTitle}>Carregando sua biblioteca</h1>
        <p className={styles.emptyStateDesc}>{loadingMessage}</p>
        {progress !== null && (
          <div className={styles.scanProgress}>
            <div
              className={styles.scanProgressTrack}
              role="progressbar"
              aria-label="Progresso da varredura da biblioteca"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div style={{ width: `${progress}%` }} />
            </div>
            <span>{activeScanStatus?.processed || 0} de {activeScanStatus?.total} arquivos ({progress}%)</span>
          </div>
        )}
        {activeScanStatus && (
          <button className={`${styles.actionBtn} ${styles.cancelActionBtn}`} onClick={cancelLibraryScan}>
            Cancelar varredura
          </button>
        )}
      </div>
    );
  }

  if (tracks.length === 0 && libraryStatus.phase === 'permission-required') {
    return (
      <div className={styles.emptyStateContainer} role="alert">
        <FolderPlus size={64} className={styles.folderIcon} />
        <h1 className={styles.emptyStateTitle}>Confirme o acesso à sua biblioteca</h1>
        <p className={styles.emptyStateDesc}>{libraryStatus.folder}</p>
        <button className={styles.actionBtn} onClick={() => void reauthorizeLibraryFolder()}>
          Reautorizar pasta
        </button>
      </div>
    );
  }

  if (tracks.length === 0 && libraryStatus.phase === 'error') {
    return (
      <div className={styles.emptyStateContainer} role="alert">
        <FolderPlus size={64} className={styles.folderIcon} />
        <h1 className={styles.emptyStateTitle}>Não foi possível carregar a biblioteca</h1>
        <p className={styles.emptyStateDesc}>{libraryStatus.message}</p>
        <button className={styles.actionBtn} onClick={() => void checkPermissionsAndReload()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div>
        <div className={styles.homeHeaderContainer}>
          <h1 className="section-title" style={{ fontSize: '32px', marginBottom: 0 }}>Olá</h1>
          <button className={styles.settingsGearBtn} onClick={() => setView('settings')} aria-label="Abrir configurações da biblioteca" title="Configurações da biblioteca">
            <Settings size={22} />
          </button>
        </div>
        <div className={styles.emptyStateContainer} style={{ marginTop: '40px' }}>
          <FolderPlus size={64} className={styles.folderIcon} />
          <h1 className={styles.emptyStateTitle}>Sua biblioteca está vazia</h1>
          <p className={styles.emptyStateDesc}>
            Para começar a ouvir suas músicas, adicione uma pasta do seu computador (macOS, Windows, Linux) 
            ou importe arquivos de áudio do seu celular.
          </p>
          <button className={styles.actionBtn} onClick={scanLocalFolder} style={{ marginTop: '12px' }}>
            Adicionar pasta de música
          </button>
        </div>
      </div>
    );
  }

  // Active view filters data
  const listenAgainTracks = tracks.slice(0, 6);
  const favoritesTracks = tracks.filter(t => t.isFavorite);
  
  const mostPlayedTracks = [...tracks].filter(t => (t.playCount || 0) > 0).sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
  const mostPlayedList = mostPlayedTracks.length > 0 ? mostPlayedTracks : [...tracks].slice(0, 20);

  const recentlyPlayedTracks = [...tracks].filter(t => (t.lastPlayed || 0) > 0).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  const recentlyPlayedList = recentlyPlayedTracks.length > 0
    ? recentlyPlayedTracks
    : [...tracks].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0)).slice(0, 20);

  const renderTracksTable = (title: string, list: Track[], isRanking: boolean = false) => {
    if (list.length === 0) {
      return (
        <div style={{ padding: '24px 0', color: 'var(--text-subdued)', textAlign: 'center' }}>
          Nenhuma música encontrada nesta categoria. Toque algumas músicas na biblioteca primeiro!
        </div>
      );
    }

    return (
      <div style={{ marginTop: '12px' }}>
        <h2 className={styles.homeSectionTitle} style={{ marginBottom: '16px' }}>{title}</h2>
        <table className={styles.tracksTable}>
          <thead>
            <tr>
              <th className={styles.trackRowNum}>#</th>
              <th>Título</th>
              <th>Álbum</th>
              {isRanking && <th style={{ width: '120px', textAlign: 'center' }}>Reproduções</th>}
              <th className={styles.trackRowDuration}><Clock size={16} /></th>
              <th style={{ width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((track, idx) => {
              const isActive = currentTrack?.id === track.id;
              return (
                <tr 
                  key={track.id} 
                  className={`${styles.trackRow} ${isActive ? styles.active : ''}`}
                  onClick={() => playTrack(track, list)}
                >
                  <td className={styles.trackRowNum}>
                    {isActive && isPlaying ? (
                      <div className={styles.spinner} style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                    ) : (
                      idx + 1
                    )}
                  </td>
                  <td>
                    <div className={styles.trackRowTitleCol}>
                      {track.coverArt ? (
                        <img src={track.coverArt} className={styles.trackRowArt} alt="" />
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
                  {isRanking && (
                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--text-bright)' }}>
                      {track.playCount || 0}
                    </td>
                  )}
                  <td className={styles.trackRowDuration}>
                    {formatDuration(track.duration)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button 
                      className={styles.addToPlaylistBtn} 
                      onClick={() => toggleTrackFavorite(track.id)}
                      title={track.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                      style={{ color: track.isFavorite ? 'var(--spotify-green)' : 'var(--text-subdued)' }}
                    >
                      <Heart size={16} fill={track.isFavorite ? "currentColor" : "none"} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      {libraryStatus.phase === 'permission-required' && (
        <div className={styles.permissionBanner} role="alert">
          <div>
            <strong>A biblioteca precisa de permissão</strong>
            <span>{libraryStatus.folder}</span>
          </div>
          <button onClick={() => void reauthorizeLibraryFolder()}>Reautorizar pasta</button>
        </div>
      )}
      {/* Category Filter Tags */}
      <div className={styles.categoryPillsContainer}>
        {categories.map((cat, idx) => (
          <button 
            key={idx} 
            className={`${styles.categoryPill} ${activeCategory === cat ? styles.active : ''}`}
            onClick={() => setActiveCategory(cat)}
            style={{
              backgroundColor: activeCategory === cat ? 'var(--text-bright)' : 'rgba(255, 255, 255, 0.08)',
              color: activeCategory === cat ? 'var(--bg-base)' : '#ffffff'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {activeCategory === "Tudo" && (
        <>
          {/* Section Header Row with Mobile Icons */}
          <div className={`${styles.homeProfileHeader} ${styles.homeMobileHeader}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 0, marginBottom: '24px' }}>
            <h1 className={`${styles.profileSectionTitle} ${styles.mobileOnlyTextTitle}`} style={{ margin: 0 }}>Recently played</h1>
            <h1 className={`${styles.profileSectionTitle} ${styles.desktopOnlyTextTitle}`} style={{ margin: 0 }}>Ouvir de novo</h1>
            <div className={styles.homeHeaderIcons} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <button 
                className={styles.headerIconBtn} 
                onClick={refreshRecommendations} 
                title="Atualizar recomendações" 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-subdued)', 
                  cursor: 'pointer', 
                  padding: '4px', 
                  display: 'flex', 
                  alignItems: 'center' 
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-base)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-subdued)')}
              >
                {isSearchingRecs || isSearchingPlaylists ? (
                  <Loader2 size={22} className={styles.spinner} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)' }} />
                ) : (
                  <RotateCw size={22} />
                )}
              </button>
              <button className={`${styles.headerIconBtn} ${styles.mobileOnlyHeaderBtn}`} title="Notificações" style={{ background: 'none', border: 'none', color: 'var(--text-subdued)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                <Bell size={22} />
              </button>
              <button className={`${styles.headerIconBtn} ${styles.mobileOnlyHeaderBtn}`} onClick={() => setView('queue')} title="Fila de reprodução" style={{ background: 'none', border: 'none', color: 'var(--text-subdued)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                <Clock size={22} />
              </button>
              <button className={`${styles.settingsGearBtn} ${styles.headerIconBtn}`} onClick={() => setView('settings')} aria-label="Abrir configurações da biblioteca" title="Configurações da biblioteca" style={{ display: 'flex', alignItems: 'center' }}>
                <Settings size={22} />
              </button>
            </div>
          </div>

          {/* Ouvir de novo Grid */}
          <div className={styles.homeSection}>
            <div className={styles.gridCards}>
              {listenAgainTracks.map((track) => (
                <div 
                  key={track.id} 
                  className={styles.card}
                  onClick={() => playTrack(track, tracks)}
                >
                  <div className={styles.cardImgContainer}>
                    {track.coverArt ? (
                      <img src={track.coverArt} alt={track.title} className={styles.cardImg} />
                    ) : (
                      <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                        <Disc size={64} color="#727272" />
                      </div>
                    )}
                    <button 
                      className={styles.cardPlayBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        playTrack(track, tracks);
                      }}
                      title={`Tocar ${track.title}`}
                    >
                      <Play size={20} fill="currentColor" />
                    </button>
                  </div>
                  <div className={styles.cardTitle} title={track.title}>{track.title}</div>
                  <div className={styles.cardDesc}>Música • {track.artist}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Playlists Section */}
          {(isSearchingPlaylists || recommendedPlaylists.length > 0) && (
            <div className={styles.homeSection} style={{ marginTop: '24px', marginBottom: '24px' }}>
              <div className={styles.homeSectionHeader} style={{ marginBottom: '16px' }}>
                <h2 className={styles.homeSectionTitle}>Playlists recomendadas para você</h2>
                {recGenre && (
                  <p style={{ fontSize: '13px', color: 'var(--text-subdued)', marginTop: '4px' }}>
                    Com base no seu gênero mais ouvido: <strong>{recGenre}</strong>
                  </p>
                )}
              </div>
              {isSearchingPlaylists ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <Loader2 className={styles.spinner} size={24} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)' }} />
                </div>
              ) : (
                <div className={styles.gridCards}>
                  {recommendedPlaylists.map((playlist) => (
                    <div 
                      key={playlist.playlistId} 
                      className={styles.card}
                      onClick={() => setView('playlist', { 
                        id: playlist.playlistId, 
                        name: playlist.name, 
                        artist: playlist.artist?.name || 'Spotify Curated', 
                        coverUrl: playlist.thumbnails && playlist.thumbnails.length > 0 ? playlist.thumbnails[playlist.thumbnails.length - 1].url : '',
                        source: 'youtube'
                      })}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={styles.cardImgContainer}>
                        {playlist.thumbnails && playlist.thumbnails.length > 0 ? (
                          <img src={playlist.thumbnails[playlist.thumbnails.length - 1].url} alt={playlist.name} className={styles.cardImg} />
                        ) : (
                          <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                            <Disc size={64} color="#727272" />
                          </div>
                        )}
                        <button 
                          className={styles.cardPlayBtn}
                          title="Visualizar playlist"
                          onClick={(e) => {
                            e.stopPropagation();
                            setView('playlist', { 
                              id: playlist.playlistId, 
                              name: playlist.name, 
                              artist: playlist.artist?.name || 'Spotify Curated', 
                              coverUrl: playlist.thumbnails && playlist.thumbnails.length > 0 ? playlist.thumbnails[playlist.thumbnails.length - 1].url : '',
                              source: 'youtube'
                            });
                          }}
                        >
                          <Play size={20} fill="currentColor" />
                        </button>
                      </div>
                      <div className={styles.cardTitle} title={playlist.name}>{playlist.name}</div>
                      <div className={styles.cardDesc} title={playlist.artist?.name || 'Spotify Curated'}>
                        Playlist • {playlist.artist?.name || 'Spotify Curated'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Smart Mixtapes Section */}
          {mixtapes.length > 0 && (
            <div className={styles.homeSection}>
              <div className={styles.homeSectionHeader}>
                <h2 className={styles.homeSectionTitle}>Mixtapes criadas para você</h2>
              </div>
              <div className={styles.gridCards}>
                {mixtapes.map((mix, idx) => (
                  <div 
                    key={idx} 
                    className={styles.card}
                    onClick={() => playTrack(mix.tracks[0], mix.tracks)}
                  >
                    <div className={styles.cardImgContainer}>
                      {renderMixtapeCover(mix.tracks, mix.name)}
                      <button 
                        className={styles.cardPlayBtn}
                        onClick={(e) => handlePlayCollection(e, mix.tracks)}
                        title={`Tocar ${mix.name}`}
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                    </div>
                    <div className={styles.cardTitle}>{mix.name}</div>
                    <div className={styles.cardDesc} title={mix.desc}>{mix.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* YouTube Recommendations Section (Smart Algorithm based on local taste) */}
          {(isSearchingRecs || ytRecs.length > 0) && (
            <div className={styles.homeSection} style={{ marginTop: '24px' }}>
              <div className={styles.homeSectionHeader} style={{ marginBottom: '16px' }}>
                <h2 className={styles.homeSectionTitle}>Recomendações do YouTube para você</h2>
                {recArtist && (
                  <p style={{ fontSize: '13px', color: 'var(--text-subdued)', marginTop: '4px' }}>
                    Com base no seu gosto por <strong>{recArtist}</strong>
                  </p>
                )}
              </div>
              {isSearchingRecs ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <Loader2 className={styles.spinner} size={24} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)' }} />
                </div>
              ) : (
                <div className={styles.gridCards}>
                {ytRecs.map((item) => {
                  const localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === item.videoId);
                  const isDownloaded = !!localMatch;
                  const status = isDownloaded ? 'completed' : (downloadStatuses[item.videoId] || 'idle');
                  return (
                    <div 
                      key={item.videoId} 
                      className={styles.card}
                      onClick={() => handleRecClick(item)}
                    >
                      <div className={styles.cardImgContainer}>
                        {item.thumbnails && item.thumbnails.length > 0 ? (
                          <img src={item.thumbnails[item.thumbnails.length - 1].url} alt={item.name} className={styles.cardImg} />
                        ) : (
                          <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                            <Disc size={64} color="#727272" />
                          </div>
                        )}
                        <button 
                          className={styles.cardPlayBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRecClick(item);
                          }}
                          title={`Ouvir ${item.name}`}
                        >
                          <Play size={20} fill="currentColor" />
                        </button>
                      </div>
                      <div className={styles.cardTitle} title={item.name}>{item.name}</div>
                      <div className={styles.cardDesc} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>YouTube • {item.artist?.name}</span>
                        <span onClick={(e) => { e.stopPropagation(); handleDownload(item); }}>
                          {status === 'downloading' ? (
                            <Loader2 size={16} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)' }} />
                          ) : status === 'completed' ? (
                            <Check size={16} color="var(--spotify-green)" />
                          ) : (
                            <button className={styles.addToPlaylistBtn} style={{ padding: '4px' }} title="Baixar recomendação">
                              <Download size={14} />
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* Álbuns para você Section */}
          {albums.length > 0 && (
            <div className={styles.homeSection}>
              <div className={styles.homeSectionHeader}>
                <h2 className={styles.homeSectionTitle}>Álbuns para você</h2>
              </div>
              <div className={styles.gridCards}>
                {albums.slice(0, 6).map((album, idx) => (
                  <div 
                    key={idx} 
                    className={styles.card}
                    onClick={() => setView('album', { name: album.title })}
                  >
                    <div className={styles.cardImgContainer}>
                      {album.coverArt ? (
                        <img src={album.coverArt} alt={album.title} className={styles.cardImg} />
                      ) : (
                        <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                          <Disc size={64} color="#727272" />
                        </div>
                      )}
                      <button 
                        className={styles.cardPlayBtn}
                        onClick={(e) => handlePlayCollection(e, album.tracks)}
                        title={`Tocar álbum ${album.title}`}
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                    </div>
                    <div className={styles.cardTitle} title={album.title}>{album.title}</div>
                    <div className={styles.cardDesc}>Álbum • {album.artist}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Da sua biblioteca Section */}
          <div className={styles.homeSection}>
            <div className={styles.homeSectionHeader}>
              <h2 className={styles.homeSectionTitle}>Da sua biblioteca</h2>
            </div>
            <div className={styles.gridCards}>
              {folders.map((folder, idx) => {
                const folderTracks = tracks.filter(t => t.filePath.startsWith(folder + '/'));
                const firstCover = folderTracks.find(t => !!t.coverArt)?.coverArt;
                
                return (
                  <div 
                    key={`folder_${idx}`} 
                    className={styles.card}
                    onClick={() => setView('folder', { name: folder })}
                  >
                    <div className={styles.cardImgContainer}>
                      {firstCover ? (
                        <img src={firstCover} className={styles.cardImg} alt={folder} />
                      ) : (
                        <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                          <Folder size={64} color="#727272" />
                        </div>
                      )}
                      <button 
                        className={styles.cardPlayBtn}
                        onClick={(e) => handlePlayCollection(e, folderTracks)}
                        title={`Tocar pasta ${folder}`}
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                    </div>
                    <div className={styles.cardTitle} title={folder}>{folder}</div>
                    <div className={styles.cardDesc}>Pasta Local • {folderTracks.length} músicas</div>
                  </div>
                );
              })}

              {playlists.map((playlist) => {
                const playlistTracks = playlist.trackIds
                  .map(id => tracks.find(t => t.id === id))
                  .filter(Boolean) as Track[];
                const firstCover = playlistTracks.find(t => !!t.coverArt)?.coverArt;

                return (
                  <div 
                    key={playlist.id} 
                    className={styles.card}
                    onClick={() => setView('playlist', { id: playlist.id, name: playlist.name })}
                  >
                    <div className={styles.cardImgContainer}>
                      {firstCover ? (
                        <img src={firstCover} className={styles.cardImg} alt={playlist.name} />
                      ) : (
                        renderMixtapeCover(playlistTracks, playlist.name)
                      )}
                      <button 
                        className={styles.cardPlayBtn}
                        onClick={(e) => handlePlayCollection(e, playlistTracks)}
                        title={`Tocar playlist ${playlist.name}`}
                        disabled={playlistTracks.length === 0}
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                    </div>
                    <div className={styles.cardTitle} title={playlist.name}>{playlist.name}</div>
                    <div className={styles.cardDesc}>Playlist • {playlistTracks.length} músicas</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {activeCategory === "Playlists" && (
        <div className={styles.homeSection} style={{ marginTop: '12px' }}>
          <h2 className={styles.homeSectionTitle}>Suas Playlists</h2>
          <div className={styles.gridCards}>
            {playlists.map((playlist) => {
              const playlistTracks = playlist.trackIds
                .map(id => tracks.find(t => t.id === id))
                .filter(Boolean) as Track[];
              const firstCover = playlistTracks.find(t => !!t.coverArt)?.coverArt;

              return (
                <div 
                  key={playlist.id} 
                  className={styles.card}
                  onClick={() => setView('playlist', { id: playlist.id, name: playlist.name })}
                >
                  <div className={styles.cardImgContainer}>
                    {firstCover ? (
                      <img src={firstCover} className={styles.cardImg} alt={playlist.name} />
                    ) : (
                      renderMixtapeCover(playlistTracks, playlist.name)
                    )}
                    <button 
                      className={styles.cardPlayBtn}
                      onClick={(e) => handlePlayCollection(e, playlistTracks)}
                      title={`Tocar playlist ${playlist.name}`}
                      disabled={playlistTracks.length === 0}
                    >
                      <Play size={20} fill="currentColor" />
                    </button>
                  </div>
                  <div className={styles.cardTitle} title={playlist.name}>{playlist.name}</div>
                  <div className={styles.cardDesc}>Playlist • {playlistTracks.length} músicas</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeCategory === "Álbuns" && (
        <div className={styles.homeSection} style={{ marginTop: '12px' }}>
          <h2 className={styles.homeSectionTitle}>Todos os Álbuns</h2>
          <div className={styles.gridCards}>
            {albums.map((album, idx) => (
              <div 
                key={idx} 
                className={styles.card}
                onClick={() => setView('album', { name: album.title })}
              >
                <div className={styles.cardImgContainer}>
                  {album.coverArt ? (
                    <img src={album.coverArt} alt={album.title} className={styles.cardImg} />
                  ) : (
                    <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                      <Disc size={64} color="#727272" />
                    </div>
                  )}
                  <button 
                    className={styles.cardPlayBtn}
                    onClick={(e) => handlePlayCollection(e, album.tracks)}
                    title={`Tocar álbum ${album.title}`}
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                </div>
                <div className={styles.cardTitle} title={album.title}>{album.title}</div>
                <div className={styles.cardDesc}>Álbum • {album.artist}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeCategory === "Artistas" && (
        <div className={styles.homeSection} style={{ marginTop: '12px' }}>
          <h2 className={styles.homeSectionTitle}>Todos os Artistas</h2>
          <div className={styles.gridCards}>
            {artists.map((artist, idx) => (
              <div 
                key={idx} 
                className={styles.card}
                onClick={() => setView('artist', { name: artist.name })}
              >
                <div className={styles.cardImgContainer} style={{ borderRadius: '50%' }}>
                  {artist.coverArt ? (
                    <img src={artist.coverArt} alt={artist.name} className={styles.cardImg} />
                  ) : (
                    <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                      <User size={64} color="#727272" />
                    </div>
                  )}
                  <button 
                    className={styles.cardPlayBtn}
                    onClick={(e) => handlePlayCollection(e, artist.tracks)}
                    title={`Tocar músicas de ${artist.name}`}
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                </div>
                <div className={styles.cardTitle}>{artist.name}</div>
                <div className={styles.cardDesc}>Artista • {artist.count} músicas</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeCategory === "Gêneros" && (
        <div className={styles.homeSection} style={{ marginTop: '12px' }}>
          <h2 className={styles.homeSectionTitle}>Todos os Gêneros</h2>
          <div className={styles.gridCards}>
            {genres.map((genre, idx) => (
              <div 
                key={idx} 
                className={styles.card}
                onClick={(e) => handlePlayCollection(e, genre.tracks)}
              >
                <div className={styles.cardImgContainer}>
                  <div className={`${styles.cardImg} ${styles.mixtapeFallbackGradient}`} style={{ background: 'linear-gradient(135deg, #1db954, #191414)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Music size={40} color="#ffffff" />
                  </div>
                  <button 
                    className={styles.cardPlayBtn}
                    title={`Tocar gênero ${genre.name}`}
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                </div>
                <div className={styles.cardTitle}>{genre.name}</div>
                <div className={styles.cardDesc}>Gênero • {genre.count} músicas</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeCategory === "Mais tocadas" && (
        renderTracksTable(
          mostPlayedTracks.length > 0 ? "Músicas Mais Tocadas" : "Músicas Recomendadas",
          mostPlayedList,
          mostPlayedTracks.length > 0
        )
      )}

      {activeCategory === "Favoritas" && (
        renderTracksTable("Músicas Favoritas", favoritesTracks)
      )}

      {activeCategory === "Recentes" && (
        renderTracksTable(
          recentlyPlayedTracks.length > 0 ? "Tocadas Recentemente" : "Adicionadas Recentemente",
          recentlyPlayedList
        )
      )}

    </div>
  );
};
