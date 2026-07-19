import React, { useState, useEffect, useRef } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { Search, Clock, Disc, Download, Loader2, Check, AlertCircle, MoreHorizontal, Play, User, Heart, MonitorSmartphone } from 'lucide-react';
import type { Track } from '../../../shared/types';
import { getYouTubeIdFromTrack, loadCachedLibrary } from '../../../utils/libraryEngine';
import { TrackMenuDropdown } from '../../../components/ui/TrackMenuDropdown';
import { isOnlineCapable } from '../../../services/platformService';
import styles from '../styles/SearchView.module.css';

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SEARCH_TIMEOUT')), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

const getPlaylistIdFromUrl = (url: string): string | null => {
  try {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.includes('list=')) {
      const match = trimmed.match(/[?&]list=([^&]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch (e) {
    // Ignore
  }
  return null;
};

export const SearchView: React.FC = () => {
  const { 
    tracks, 
    folders,
    currentTrack, 
    isPlaying, 
    playTrack, 
    togglePlay,
    showAlert,
    showConfirm,
    checkPermissionsAndReload,
    setView,
    downloadQueue,
    toggleTrackFavorite,

    ytSearchQuery: query,
    setYtSearchQuery: setQuery,
    ytSearchMode: searchMode,
    setYtSearchMode: setSearchMode,
    ytSearchResults: ytResults,
    setYtSearchResults: setYtResults,
    ytSearchCategory: selectedCategory,
    setYtSearchCategory: setSelectedCategory
  } = useMediaLibrary();

  const [activeTrackDropdown, setActiveTrackDropdown] = useState<string | null>(null);

  // YouTube Music specific states
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const searchRequestIdRef = useRef(0);
  const [downloadStatuses, setDownloadStatuses] = useState<{ [key: string]: 'idle' | 'downloading' | 'completed' | 'error' }>({});

  const [autocompleteData, setAutocompleteData] = useState<{
    suggestions: string[];
    artists: any[];
    playlist?: { id: string; name: string; artist: string; coverUrl: string } | null;
  } | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Debounced autocomplete search suggestion fetching
  useEffect(() => {
    if (searchMode !== 'youtube' || !query.trim()) {
      setAutocompleteData(null);
      return;
    }

    const playlistId = getPlaylistIdFromUrl(query);
    if (playlistId) {
      const delayDebounceFn = setTimeout(async () => {
        if (window.electronAPI?.getPlaylistDetails) {
          try {
            const details = await window.electronAPI.getPlaylistDetails(playlistId);
            if (details) {
              setAutocompleteData({
                suggestions: [],
                artists: [],
                playlist: {
                  id: playlistId,
                  name: details.name || 'YouTube Music Playlist',
                  artist: details.artist?.name || 'YouTube Music',
                  coverUrl: details.thumbnails && details.thumbnails.length > 0 
                    ? details.thumbnails[details.thumbnails.length - 1].url 
                    : ''
                }
              });
            }
          } catch (err) {
            console.error('Error fetching playlist details for autocomplete:', err);
            setAutocompleteData({ suggestions: [], artists: [], playlist: null });
          }
        }
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    }

    // Spotify playlist URL check
    if (query.includes('spotify.com/playlist/')) {
      const delayDebounceFn = setTimeout(async () => {
        if (window.electronAPI?.resolveSpotifyUrl) {
          try {
            const clientId = localStorage.getItem('spotify_client_id') || '';
            const clientSecret = localStorage.getItem('spotify_client_secret') || '';
            const spotifyData = await window.electronAPI.resolveSpotifyUrl(query.trim(), { clientId, clientSecret });
            if (spotifyData) {
              setAutocompleteData({
                suggestions: [],
                artists: [],
                playlist: {
                  id: spotifyData.id,
                  name: spotifyData.name || 'Spotify Playlist',
                  artist: spotifyData.artist || 'Spotify',
                  coverUrl: spotifyData.coverUrl || '',
                  source: 'spotify',
                  tracks: spotifyData.tracks
                } as any
              });
            }
          } catch (err) {
            console.error('Error resolving Spotify playlist for autocomplete:', err);
            setAutocompleteData({ suggestions: [], artists: [], playlist: null });
          }
        }
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    }

    const delayDebounceFn = setTimeout(async () => {
      if (window.electronAPI?.getSearchAutocomplete) {
        try {
          const data = await window.electronAPI.getSearchAutocomplete(query.trim());
          setAutocompleteData(data);
        } catch (err) {
          console.error('Error fetching autocomplete:', err);
        }
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, searchMode]);

  const normalizedQuery = query.trim();
  const filteredTracks = tracks.filter(track => {
    const q = normalizedQuery.toLowerCase();
    return (
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      track.album.toLowerCase().includes(q)
    );
  });

  const formatDuration = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleRowClick = (track: Track) => {
    if (currentTrack && currentTrack.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, filteredTracks);
    }
  };

  const handleYtSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    handleYtSearchDirect(query.trim());
  };

  const handleYtSearchDirect = async (searchQuery: string) => {
    if (!window.electronAPI) return;
    searchQuery = searchQuery.trim();
    if (!searchQuery) return;

    // Check if it's a Spotify URL
    if (searchQuery.includes('spotify.com/')) {
      if (!window.electronAPI.resolveSpotifyUrl) return;
      
      setIsSearchingYt(true);
      try {
        const clientId = localStorage.getItem('spotify_client_id') || '';
        const clientSecret = localStorage.getItem('spotify_client_secret') || '';
        const spotifyData = await window.electronAPI.resolveSpotifyUrl(searchQuery, { clientId, clientSecret });
        if (spotifyData) {
          // Send it directly to the playlist view since it has the tracks
          // For single tracks, we could send it to a different view, but playlist view handles 'SONG' arrays fine
          // We will mock it as a playlist regardless for simplicity
          window.dispatchEvent(new CustomEvent('spotify-resolved', { detail: spotifyData }));
          
          setView('playlist', {
            id: spotifyData.id,
            name: spotifyData.name,
            artist: spotifyData.artist,
            coverUrl: spotifyData.coverUrl,
            source: 'spotify',
            tracks: spotifyData.tracks // We pass the tracks directly so PlaylistView doesn't need to fetch them
          });

          if (spotifyData.limitExceeded) {
            const hasCredentials = !!(localStorage.getItem('spotify_client_id') && localStorage.getItem('spotify_client_secret'));
            if (hasCredentials) {
              showAlert(
                'Importação Parcial (Restrição Spotify API)',
                'Esta playlist possui mais de 100 músicas. Apenas as primeiras 100 foram importadas via scraping porque a API oficial do Spotify retornou erro (403 Forbidden).\n\nIsso acontece devido a novas restrições do Spotify que bloqueiam o acesso a playlists de terceiros para aplicativos em modo de desenvolvimento.\n\nDica: Se a playlist não for sua, você pode duplicá-la para a sua própria biblioteca do Spotify (tornando-se o dono dela). Com suas credenciais oficiais configuradas no app, a API conseguirá importar todas as músicas perfeitamente!\n\nAlternativamente, você pode usar o link correspondente no YouTube Music ou dividir a playlist em partes de até 100 músicas.'
              );
            } else {
              const goToSettings = await showConfirm(
                'Importação Parcial',
                'Esta playlist possui mais de 100 músicas. Apenas as primeiras 100 músicas foram importadas via scraping.\n\nPara importar a playlist inteira, é necessário configurar suas credenciais de desenvolvedor do Spotify. Deseja ir para as Configurações agora?'
              );
              if (goToSettings) {
                setView('settings');
              }
            }
          }
        } else {
          showAlert('Erro', 'Não foi possível ler este link do Spotify. Verifique se ele é público.');
        }
      } catch (err) {
        console.error('Failed to resolve Spotify URL:', err);
        showAlert('Erro', 'Falha ao resolver o link do Spotify.');
      } finally {
        setIsSearchingYt(false);
      }
      return;
    }

    if (!window.electronAPI.searchYouTubeMusic) return;

    if (navigator.onLine === false) {
      setLastSearchQuery(searchQuery);
      setSearchError('Você está sem conexão. Reconecte-se e tente novamente.');
      setIsSearchingYt(false);
      return;
    }

    const playlistId = getPlaylistIdFromUrl(searchQuery);
    if (playlistId && window.electronAPI.getPlaylistDetails) {
      setIsSearchingYt(true);
      try {
        const details = await window.electronAPI.getPlaylistDetails(playlistId);
        if (details) {
          setView('playlist', {
            id: playlistId,
            name: details.name || 'YouTube Music Playlist',
            artist: details.artist?.name || 'YouTube Music',
            coverUrl: details.thumbnails && details.thumbnails.length > 0 
              ? details.thumbnails[details.thumbnails.length - 1].url 
              : '',
            source: 'youtube'
          });
          return;
        }
      } catch (err) {
        console.error('Failed to load playlist by URL:', err);
        showAlert('Erro de Playlist', 'Não foi possível carregar os detalhes da playlist através do link fornecido. Verifique se a playlist é pública.');
        return;
      } finally {
        setIsSearchingYt(false);
      }
    }

    if (isSearchingYt && lastSearchQuery === searchQuery) return;
    const requestId = ++searchRequestIdRef.current;
    setLastSearchQuery(searchQuery);
    setSearchError(null);
    setIsSearchingYt(true);
    setSelectedCategory('all');
    try {
      const results = await withTimeout(window.electronAPI.searchYouTubeMusic(searchQuery), 15000);
      if (requestId !== searchRequestIdRef.current) return;
      // Ensure we get structured object { songs, artists, albums, playlists }
      if (results && (results.songs || results.artists || results.albums || results.playlists)) {
        setYtResults(results);
      } else if (Array.isArray(results)) {
        setYtResults({
          songs: results,
          artists: [],
          albums: [],
          playlists: []
        });
      } else {
        setYtResults({ songs: [], artists: [], albums: [], playlists: [] });
      }
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) return;
      console.error('Erro ao buscar no YouTube Music:', err);
      setSearchError(err instanceof Error && err.message === 'SEARCH_TIMEOUT'
        ? 'A busca demorou mais que o esperado.'
        : 'Não foi possível buscar no YouTube Music. Verifique sua conexão.');
    } finally {
      if (requestId === searchRequestIdRef.current) setIsSearchingYt(false);
    }
  };

  const handleYtSelectArtist = async (artistId: string, artistName: string) => {
    if (!window.electronAPI || !window.electronAPI.getYtArtistDetails) return;
    setIsSearchingYt(true);
    setQuery(artistName);
    setYtResults(null);
    setSelectedCategory('all');
    try {
      const results = await window.electronAPI.getYtArtistDetails(artistId);
      if (results && results.artist) {
        setYtResults({
          songs: results.songs || [],
          artists: [results.artist],
          albums: results.albums || [],
          playlists: []
        });
      } else {
        handleYtSearchDirect(artistName);
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do artista:', err);
      handleYtSearchDirect(artistName);
    } finally {
      setIsSearchingYt(false);
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
        // Trigger silent library scan
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

  const handleYtRowClick = async (item: any) => {
    const localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === item.videoId);
    if (localMatch) {
      if (currentTrack && currentTrack.id === localMatch.id) {
        togglePlay();
      } else {
        playTrack(localMatch, [localMatch]);
      }
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

  const topArtist = ytResults?.artists?.[0];
  const topTracks = ytResults?.songs?.slice(0, 3) || [];
  const songsToShow = selectedCategory === 'all' ? (ytResults?.songs?.slice(3) || []) : (ytResults?.songs || []);
  const artistsToShow = ytResults?.artists || [];
  const albumsToShow = ytResults?.albums || [];
  const playlistsToShow = ytResults?.playlists || [];

  if (!isOnlineCapable()) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
        <MonitorSmartphone size={64} color="#727272" />
        <h2 style={{ color: '#b3b3b3', fontSize: '1.2rem' }}>Busca indisponível</h2>
        <p style={{ color: '#727272', textAlign: 'center', maxWidth: 300 }}>
          A busca online está disponível apenas na versão desktop. Use a biblioteca local para ouvir suas músicas.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="section-title">Buscar</h1>

      {/* Tabs */}
      {window.electronAPI?.isElectron && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button 
            onClick={() => {
              setSearchMode('local');
              setQuery('');
            }}
            className={`${styles.filterPill} ${searchMode === 'local' ? styles.active : ''}`}
          >
            Biblioteca Local
          </button>
          <button 
            onClick={() => {
              setSearchMode('youtube');
              setQuery('');
              setYtResults(null);
            }}
            className={`${styles.filterPill} ${searchMode === 'youtube' ? styles.active : ''}`}
          >
            Buscar na internet
          </button>
        </div>
      )}
      
      {/* Search Input */}
      {searchMode === 'local' ? (
        <div className={styles.searchBarContainer}>
          <Search size={18} color="var(--text-subdued)" />
          <input 
            type="text" 
            placeholder="O que você quer ouvir na sua biblioteca?" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.searchInput}
            autoFocus
          />
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <form onSubmit={handleYtSearch} className={styles.searchBarContainer}>
            <Search size={18} color="var(--text-subdued)" />
            <input 
              type="text" 
              placeholder="Pesquisar músicas e baixar da internet..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowAutocomplete(true)}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 250)}
              className={styles.searchInput}
              autoFocus
            />
            <button type="submit" style={{ display: 'none' }} />
          </form>
          {isSearchingYt && (
            <div className={styles.searchStatus} role="status" aria-live="polite">
              <div className={styles.spinner} />
              <span>Buscando “{lastSearchQuery}” no YouTube Music…</span>
            </div>
          )}
          {searchError && (
            <div className={styles.searchError} role="alert">
              <span>{searchError}</span>
              <button type="button" onClick={() => void handleYtSearchDirect(lastSearchQuery)}>Tentar novamente</button>
            </div>
          )}

          {showAutocomplete && autocompleteData && ((autocompleteData.suggestions || []).length > 0 || (autocompleteData.artists || []).length > 0 || autocompleteData.playlist) && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#181818',
              border: '1px solid #282828',
              borderRadius: '8px',
              marginTop: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 999,
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '8px 0'
            }}>
              {autocompleteData.playlist && (
                <div style={{ padding: '4px 0' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-subdued)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    padding: '8px 16px 4px 16px'
                  }}>
                    Playlist Detectada
                  </div>
                  <div 
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (autocompleteData.playlist) {
                        setView('playlist', {
                          id: autocompleteData.playlist.id,
                          name: autocompleteData.playlist.name,
                          artist: autocompleteData.playlist.artist,
                          coverUrl: autocompleteData.playlist.coverUrl,
                          source: (autocompleteData.playlist as any).source || 'youtube',
                          tracks: (autocompleteData.playlist as any).tracks || undefined
                        });
                        setShowAutocomplete(false);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: 'var(--text-base)',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {autocompleteData.playlist.coverUrl ? (
                      <img 
                        src={autocompleteData.playlist.coverUrl} 
                        alt={autocompleteData.playlist.name} 
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '4px',
                          objectFit: 'cover',
                          backgroundColor: '#282828'
                        }} 
                      />
                    ) : (
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '4px',
                        backgroundColor: '#282828',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Disc size={18} color="var(--text-subdued)" />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>{autocompleteData.playlist.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-subdued)' }}>{autocompleteData.playlist.artist} • Clique para carregar</span>
                    </div>
                  </div>
                </div>
              )}

              {(autocompleteData.suggestions || []).length > 0 && (
                <div style={{ padding: '4px 0' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-subdued)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    padding: '8px 16px 4px 16px'
                  }}>
                    Sugestões
                  </div>
                  {(autocompleteData.suggestions || []).map((suggestion, idx) => (
                    <div 
                      key={idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setQuery(suggestion);
                        handleYtSearchDirect(suggestion);
                        setShowAutocomplete(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: 'var(--text-base)',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Search size={16} color="var(--text-subdued)" />
                      <span>{suggestion}</span>
                    </div>
                  ))}
                </div>
              )}

              {(autocompleteData.artists || []).length > 0 && (
                <div style={{ borderTop: (autocompleteData.suggestions || []).length > 0 ? '1px solid #282828' : 'none', padding: '8px 0 4px 0' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-subdued)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    padding: '4px 16px 8px 16px'
                  }}>
                    Artistas
                  </div>
                  {(autocompleteData.artists || []).map((artist, idx) => (
                    <div 
                      key={idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (artist.artistId) {
                          handleYtSelectArtist(artist.artistId, artist.name);
                        } else {
                          setQuery(artist.name);
                          handleYtSearchDirect(artist.name);
                        }
                        setShowAutocomplete(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: 'var(--text-base)',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {artist.thumbnails && artist.thumbnails.length > 0 ? (
                        <img 
                          src={artist.thumbnails[0].url} 
                          alt={artist.name} 
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            backgroundColor: '#282828'
                          }} 
                        />
                      ) : (
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: '#282828',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <User size={16} color="var(--text-subdued)" />
                        </div>
                      )}
                      <span>{artist.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {searchMode === 'local' ? (
        // Local Library View
        query.trim() === '' ? (
          <div style={{ color: 'var(--text-subdued)', padding: '20px 0', fontSize: '14px' }}>
            Busque por músicas, artistas ou álbuns na sua biblioteca local.
          </div>
        ) : filteredTracks.length === 0 ? (
          <div style={{ color: 'var(--text-subdued)', padding: '20px 0', fontSize: '14px' }}>
            Nenhum resultado encontrado para “{normalizedQuery}”.
          </div>
        ) : (
          <table className={styles.tracksTable}>
            <thead>
              <tr>
                <th className={styles.trackRowNum}>#</th>
                <th>Título</th>
                <th className={styles.trackColumnAlbum}>Álbum</th>
                <th className={styles.trackRowDuration}><Clock size={16} /></th>
                <th style={{ width: '85px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredTracks.map((track, idx) => {
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
                          <span className={styles.spinner} style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>
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
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                        <button 
                          className={styles.addToPlaylistBtn} 
                          onClick={() => toggleTrackFavorite(track.id)}
                          title={track.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                          style={{ color: track.isFavorite ? 'var(--spotify-green)' : 'var(--text-subdued)', padding: 0 }}
                        >
                          <Heart size={16} fill={track.isFavorite ? "currentColor" : "none"} />
                        </button>
                        <button 
                          className={styles.addToPlaylistBtn}
                          onClick={() => {
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
        )
      ) : (
        // YouTube Music View
        <div>
          {/* YouTube Category pills */}
          {ytResults && (
            <div className={styles.ytPillsContainer} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {['all', 'artists', 'songs', 'albums', 'playlists'].map(cat => {
                const label = cat === 'all' ? 'Tudo' : cat === 'artists' ? 'Artistas' : cat === 'songs' ? 'Músicas' : cat === 'albums' ? 'Álbuns' : 'Playlists';
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`${styles.filterPill} ${selectedCategory === cat ? styles.active : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {!ytResults && isSearchingYt ? (
            <div style={{ color: 'var(--text-subdued)', padding: '20px 0', fontSize: '14px' }}>
              Aguarde enquanto consultamos músicas, artistas, álbuns e playlists.
            </div>
          ) : !ytResults ? (
            <div style={{ color: 'var(--text-subdued)', padding: '20px 0', fontSize: '14px' }}>
              Digite algo acima e pressione Enter para buscar músicas no YouTube Music.
            </div>
          ) : (ytResults.songs || []).length === 0 && (ytResults.artists || []).length === 0 && (ytResults.albums || []).length === 0 && (ytResults.playlists || []).length === 0 ? (
            <div style={{ color: 'var(--text-subdued)', padding: '20px 0', fontSize: '14px' }}>
              Nenhum resultado encontrado no YouTube Music.
            </div>
          ) : (
            <div>
              {/* Top Result + Track List split block */}
              {selectedCategory === 'all' && topArtist && (
                <div className={styles.topResultContainer}>
                  <div className={styles.topResultLeft}>
                    <h3>Resultado principal</h3>
                    <div className={styles.artistCardLarge} onClick={() => { if (topArtist.artistId) { handleYtSelectArtist(topArtist.artistId, topArtist.name); } else { setQuery(topArtist.name); handleYtSearchDirect(topArtist.name); } }} style={{ cursor: 'pointer' }}>
                      {topArtist.thumbnails && topArtist.thumbnails.length > 0 ? (
                        <img src={topArtist.thumbnails[topArtist.thumbnails.length - 1].url} alt={topArtist.name} className={styles.artistArtLarge} />
                      ) : (
                        <div className={styles.artistArtLarge} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                          <User size={48} color="#727272" />
                        </div>
                      )}
                      <h2>{topArtist.name}</h2>
                      <p>Artista</p>
                      <div className={styles.artistCardActions} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.playBtnGreen} onClick={() => {
                          if (topTracks.length > 0) handleYtRowClick(topTracks[0]);
                        }}>Aleatório</button>
                        <button className={styles.playBtnOutline} onClick={() => {
                          if (topTracks.length > 0) handleYtRowClick(topTracks[0]);
                        }}>Mix</button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.topResultRight}>
                    <h3>Músicas</h3>
                    <div className={styles.topTracksList}>
                      {topTracks.map((item: any) => {
                        const localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === item.videoId);
                        const isDownloaded = !!localMatch;
                        const isYtActive = localMatch && currentTrack?.id === localMatch.id;
                        const queueItem = downloadQueue.find(q => q.videoId === item.videoId);
                        const status = isDownloaded ? 'completed' : (queueItem ? queueItem.status : (downloadStatuses[item.videoId] || 'idle'));
                        
                        return (
                          <div 
                            className={`${styles.topTrackItem} ${isYtActive ? styles.active : ''}`}
                            key={item.videoId}
                            onClick={() => handleYtRowClick(item)}
                          >
                            <div className={styles.topTrackLeft}>
                              {item.thumbnails && item.thumbnails.length > 0 ? (
                                <img src={item.thumbnails[0].url} alt={item.name} className={styles.topTrackArt} />
                              ) : (
                                <div className={styles.topTrackArt} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                                  <Disc size={18} color="#727272" />
                                </div>
                              )}
                              <div className={styles.topTrackMeta}>
                                <span className={styles.topTrackTitle} style={{ color: isYtActive ? 'var(--spotify-green)' : 'inherit' }}>
                                  {item.name}
                                </span>
                                <span className={styles.topTrackSub}>Música • {item.artist?.name || 'Artista Desconhecido'}</span>
                              </div>
                            </div>
                            <div className={styles.topTrackRight} onClick={(e) => e.stopPropagation()}>
                              {status === 'downloading' || status === 'resolving' || status === 'packaging' ? (
                                <Loader2 size={16} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)' }} />
                              ) : isDownloaded && localMatch ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                              ) : (
                                <button className={styles.addToPlaylistBtn} onClick={() => handleDownload(item)} title="Baixar música">
                                  <Download size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Songs lists table */}
              {(selectedCategory === 'all' || selectedCategory === 'songs') && songsToShow.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  {selectedCategory === 'all' && <h3 style={{ marginBottom: '16px' }}>Outras Músicas</h3>}
                  <table className={styles.tracksTable}>
                    <thead>
                      <tr>
                        <th className={styles.trackRowNum}>#</th>
                        <th>Título</th>
                        <th className={styles.trackColumnAlbum}>Álbum</th>
                        <th className={styles.trackRowDuration}><Clock size={16} /></th>
                        <th style={{ width: '80px', textAlign: 'center' }}>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {songsToShow.map((item: any, idx: number) => {
                        const localMatch = tracks.find(t => getYouTubeIdFromTrack(t) === item.videoId);
                        const isDownloaded = !!localMatch;
                        const queueItem = downloadQueue.find(q => q.videoId === item.videoId);
                        const status = isDownloaded ? 'completed' : (queueItem ? queueItem.status : (downloadStatuses[item.videoId] || 'idle'));
                        const isYtActive = localMatch && currentTrack?.id === localMatch.id;

                        return (
                          <tr 
                            key={item.videoId} 
                            className={`${styles.trackRow} ${isYtActive ? styles.active : ''}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleYtRowClick(item)}
                          >
                            <td className={styles.trackRowNum} style={{ color: isYtActive ? 'var(--spotify-green)' : 'inherit' }}>
                              {isYtActive && isPlaying ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span className={styles.spinner} style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>
                                </div>
                              ) : isYtActive ? (
                                <Play size={12} fill="currentColor" />
                              ) : (
                                idx + 1
                              )}
                            </td>
                            <td>
                              <div className={styles.trackRowTitleCol}>
                                {item.thumbnails && item.thumbnails.length > 0 ? (
                                  <img src={item.thumbnails[0].url} alt={item.name} className={styles.trackRowArt} />
                                ) : (
                                  <div className={styles.trackRowArt} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                                    <Disc size={18} color="#727272" />
                                  </div>
                                )}
                                <div className={styles.trackRowDetails}>
                                  <span className={styles.trackRowTitle} style={{ color: isYtActive ? 'var(--spotify-green)' : 'inherit' }}>
                                    {item.name}
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
                                  <span className={styles.trackRowArtist} style={{ color: isYtActive ? 'var(--spotify-green)' : 'inherit' }}>
                                    {item.artist?.name || 'Artista Desconhecido'}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className={styles.trackColumnAlbum}>
                              <span className={styles.trackRowAlbum}>{item.album?.name || 'Singles'}</span>
                            </td>
                            <td className={styles.trackRowDuration}>
                              {item.duration ? formatDuration(item.duration) : '--:--'}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                {status === 'downloading' || status === 'resolving' || status === 'packaging' ? (
                                  <Loader2 
                                    size={16} 
                                    style={{ 
                                      animation: 'spin 1s infinite linear', 
                                      color: 'var(--spotify-green)' 
                                    }} 
                                  />
                                ) : isDownloaded && localMatch ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button 
                                      className={styles.addToPlaylistBtn} 
                                      onClick={() => toggleTrackFavorite(localMatch.id)}
                                      title={localMatch.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                      style={{ color: localMatch.isFavorite ? 'var(--spotify-green)' : 'var(--text-subdued)', padding: 0 }}
                                    >
                                      <Heart size={14} fill={localMatch.isFavorite ? "currentColor" : "none"} />
                                    </button>
                                    <span title="Música na Biblioteca (Local)"><Check size={16} color="var(--spotify-green)" /></span>
                                  </div>
                                ) : status === 'error' ? (
                                  <span title="Erro no download"><AlertCircle size={16} color="#e91429" /></span>
                                ) : (
                                  <button 
                                    className={styles.addToPlaylistBtn}
                                    onClick={() => handleDownload(item)}
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
                </div>
              )}

              {/* Artists list section */}
              {selectedCategory === 'artists' && artistsToShow.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div className={styles.gridCards}>
                    {artistsToShow.map((artist: any) => (
                      <div key={artist.artistId} className={styles.card} onClick={() => { if (artist.artistId) { handleYtSelectArtist(artist.artistId, artist.name); } else { setQuery(artist.name); handleYtSearchDirect(artist.name); } }} style={{ cursor: 'pointer' }}>
                        <div className={styles.cardImgContainer} style={{ borderRadius: '50%' }}>
                          {artist.thumbnails && artist.thumbnails.length > 0 ? (
                            <img src={artist.thumbnails[artist.thumbnails.length - 1].url} alt={artist.name} className={styles.cardImg} />
                          ) : (
                            <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                              <User size={48} color="#727272" />
                            </div>
                          )}
                        </div>
                        <div className={styles.cardTitle}>{artist.name}</div>
                        <div className={styles.cardDesc}>Artista</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Albums list section */}
              {(selectedCategory === 'albums' || (selectedCategory === 'all' && albumsToShow.length > 0)) && (
                <div style={{ marginTop: '40px' }}>
                  <h3 style={{ marginBottom: '16px' }}>Álbuns</h3>
                  <div className={styles.gridCards}>
                    {albumsToShow.map((album: any) => (
                      <div 
                        key={album.albumId} 
                        className={styles.card} 
                        onClick={() => setView('album', { 
                          id: album.albumId, 
                          name: album.name, 
                          artist: album.artist?.name || 'Artista Desconhecido', 
                          coverUrl: album.thumbnails && album.thumbnails.length > 0 ? album.thumbnails[album.thumbnails.length - 1].url : '',
                          source: 'youtube'
                        })} 
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={styles.cardImgContainer}>
                          {album.thumbnails && album.thumbnails.length > 0 ? (
                            <img src={album.thumbnails[album.thumbnails.length - 1].url} alt={album.name} className={styles.cardImg} />
                          ) : (
                            <div className={styles.cardImg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#282828' }}>
                              <Disc size={48} color="#727272" />
                            </div>
                          )}
                        </div>
                        <div className={styles.cardTitle}>{album.name}</div>
                        <div className={styles.cardDesc}>Álbum • {album.artist?.name} • {album.year || ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Playlists list section */}
              {(selectedCategory === 'playlists' || (selectedCategory === 'all' && playlistsToShow.length > 0)) && (
                <div style={{ marginTop: '40px' }}>
                  <h3 style={{ marginBottom: '16px' }}>Playlists</h3>
                  <div className={styles.gridCards}>
                    {playlistsToShow.map((playlist: any) => (
                      <div 
                        key={playlist.playlistId} 
                        className={styles.card} 
                        onClick={() => setView('playlist', { 
                          id: playlist.playlistId, 
                          name: playlist.name, 
                          artist: playlist.artist?.name || 'YouTube Music', 
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
                              <Disc size={48} color="#727272" />
                            </div>
                          )}
                        </div>
                        <div className={styles.cardTitle}>{playlist.name}</div>
                        <div className={styles.cardDesc}>Playlist • {playlist.artist?.name || 'YouTube Music'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
