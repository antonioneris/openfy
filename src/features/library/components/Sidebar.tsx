import React, { useRef, useState, useEffect } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import {
  Home, Search, Library, Folder, Trash2, Plus,
  FolderUp, Music, Disc, User, X, Loader2, Check, Settings
} from 'lucide-react';
import { isOnlineCapable } from '../../../services/platformService';
import styles from '../styles/Sidebar.module.css';

type FilterType = 'all' | 'playlist' | 'album' | 'artist';

interface LibraryItem {
  type: 'album' | 'artist' | 'playlist' | 'folder';
  id: string;
  name: string;
  subtext: string;
  coverArt?: string;
  originalFolder?: string; // used for deleting folders
}

export const Sidebar: React.FC = () => {
  const { 
    tracks,
    playlists,
    currentView, 
    viewParams,
    setView, 
    scanLocalFolder, 
    importLocalFiles, 
    deleteFolder,
    createPlaylist,
    deletePlaylist,
    showConfirm,
    showPrompt,
    downloadQueue,
    clearDownloadQueue,
    isLoading,
    libraryStatus,
    reauthorizeLibraryFolder,
    cancelLibraryScan
  } = useMediaLibrary();

  const activeDownloadsCount = downloadQueue.filter(item => 
    item.status === 'downloading' || item.status === 'resolving' || item.status === 'packaging'
  ).length;
  const resolvingCount = downloadQueue.filter(item => item.status === 'resolving').length;
  const downloadingCount = downloadQueue.filter(item => item.status === 'downloading').length;
  const packagingCount = downloadQueue.filter(item => item.status === 'packaging').length;
  const pendingCount = downloadQueue.filter(item => item.status === 'pending').length;
  const completedCount = downloadQueue.filter(item => item.status === 'completed').length;
  const errorCount = downloadQueue.filter(item => item.status === 'error').length;
  const totalCount = downloadQueue.length;
  const percent = totalCount > 0 ? Math.round(((completedCount + errorCount) / totalCount) * 100) : 0;
  const activeScanStatus = libraryStatus.phase === 'refreshing' || libraryStatus.phase === 'scanning'
    ? libraryStatus
    : null;


  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleImportFilesClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
    setIsDropdownOpen(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const shouldPersist = await showConfirm(
        'Salvar Músicas Offline',
        'Deseja salvar estes arquivos de áudio (.mp3, .m4a) no armazenamento do navegador?\n\nSe sim, eles carregarão automaticamente na próxima vez. Caso contrário, estarão disponíveis apenas durante esta sessão.'
      );
      importLocalFiles(e.target.files, shouldPersist);
    }
  };

  const handleCreatePlaylistClick = async () => {
    setIsDropdownOpen(false);
    const name = await showPrompt('Criar Playlist', 'Nome da playlist:', `Minha Playlist #${playlists.length + 1}`);
    if (name && name.trim()) {
      await createPlaylist(name.trim());
    }
  };

  const handleScanFolderClick = () => {
    scanLocalFolder();
    setIsDropdownOpen(false);
  };

  // Compile library items from current tracks, folders, and playlists
  const getLibraryItems = (): LibraryItem[] => {
    const items: LibraryItem[] = [];

    // 1. Playlists
    playlists.forEach(playlist => {
      // Use playlist coverUrl if available, otherwise fall back to first track's cover art
      let coverArt: string | undefined = playlist.coverUrl;
      if (!coverArt) {
        for (const id of playlist.trackIds) {
          const track = tracks.find(t => t.id === id);
          if (track && track.coverArt) {
            coverArt = track.coverArt;
            break;
          }
        }
      }

      items.push({
        type: 'playlist',
        id: playlist.id,
        name: playlist.name,
        subtext: `Playlist • ${playlist.trackIds.length} músicas`,
        coverArt
      });
    });



    // 3. Albums (group tracks)
    const albumMap = new Map<string, { name: string; artist: string; coverArt?: string }>();
    tracks.forEach(track => {
      const key = track.album.toLowerCase();
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          name: track.album,
          artist: track.artist,
          coverArt: track.coverArt
        });
      } else if (track.coverArt && !albumMap.get(key)!.coverArt) {
        albumMap.get(key)!.coverArt = track.coverArt;
      }
    });
    albumMap.forEach((album, key) => {
      items.push({
        type: 'album',
        id: `album_${key}`,
        name: album.name,
        subtext: `Álbum • ${album.artist}`,
        coverArt: album.coverArt
      });
    });

    // 4. Artists (group tracks)
    const artistMap = new Map<string, { name: string; coverArt?: string }>();
    tracks.forEach(track => {
      const key = track.artist.toLowerCase();
      if (!artistMap.has(key)) {
        artistMap.set(key, {
          name: track.artist,
          coverArt: track.coverArt
        });
      } else if (track.coverArt && !artistMap.get(key)!.coverArt) {
        artistMap.get(key)!.coverArt = track.coverArt;
      }
    });
    artistMap.forEach((artist, key) => {
      items.push({
        type: 'artist',
        id: `artist_${key}`,
        name: artist.name,
        subtext: 'Artista',
        coverArt: artist.coverArt
      });
    });

    return items;
  };

  const allItems = getLibraryItems();

  // Filter items
  const filteredItems = allItems.filter(item => {
    // Filter type
    if (activeFilter !== 'all' && item.type !== activeFilter) {
      return false;
    }
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.subtext.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const handleItemClick = (item: LibraryItem) => {
    switch (item.type) {
      case 'playlist':
        setView('playlist', { id: item.id, name: item.name });
        break;
      case 'album':
        setView('album', { name: item.name });
        break;
      case 'artist':
        setView('artist', { name: item.name });
        break;
      case 'folder':
        setView('folder', { name: item.name });
        break;
    }
  };

  const handleItemDelete = async (e: React.MouseEvent, item: LibraryItem) => {
    e.stopPropagation();
    if (item.type === 'playlist') {
      const confirmed = await showConfirm(
        'Excluir Playlist',
        `Tem certeza que deseja deletar a playlist "${item.name}"?`
      );
      if (confirmed) {
        deletePlaylist(item.id);
      }
    } else if (item.type === 'folder' && item.originalFolder) {
      const confirmed = await showConfirm(
        'Remover Pasta',
        `Tem certeza que deseja remover a pasta "${item.name}" da sua biblioteca?`
      );
      if (confirmed) {
        deleteFolder(item.originalFolder);
      }
    }
  };

  const isItemActive = (item: LibraryItem) => {
    if (item.type === 'playlist') return currentView === 'playlist' && viewParams.id === item.id;
    if (item.type === 'album') return currentView === 'album' && viewParams.name === item.name;
    if (item.type === 'artist') return currentView === 'artist' && viewParams.name === item.name;
    if (item.type === 'folder') return currentView === 'folder' && viewParams.name === item.name;
    return false;
  };

  return (
    <aside className={styles.sidebar}>
      {/* Navigation Links */}
      <div className={`${styles.sidebarSection} ${styles.sidebarNav}`}>
        <button 
          className={`${styles.navItem} ${currentView === 'home' ? styles.active : ''}`}
          onClick={() => setView('home')}
        >
          <Home size={22} />
          <span>Início</span>
        </button>
        {isOnlineCapable() && (
          <button
            className={`${styles.navItem} ${currentView === 'search' ? styles.active : ''}`}
            onClick={() => setView('search')}
          >
            <Search size={22} />
            <span>Buscar</span>
          </button>
        )}
        <button
          className={`${styles.navItem} ${currentView === 'settings' ? styles.active : ''}`}
          onClick={() => setView('settings')}
          title="Configurações"
        >
          <Settings size={22} />
          <span>Configurações</span>
        </button>
      </div>

      {/* Library Section */}
      <div className={`${styles.sidebarSection} ${styles.librarySection}`} style={{ position: 'relative' }}>
        
        {/* Library Header */}
        <div className={styles.libraryHeader}>
          <div className={styles.libraryTitle} onClick={() => setView('home')}>
            <Library size={22} />
            <span>Sua Biblioteca</span>
          </div>
          
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button 
              className={styles.deleteBtn} 
              style={{ opacity: 1, padding: '6px' }}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title="Criar playlist ou pasta"
            >
              <Plus size={20} color="var(--text-subdued)" />
            </button>

            {/* Create Dropdown Menu */}
            {isDropdownOpen && (
              <div className={styles.createDropdown}>
                <button onClick={handleCreatePlaylistClick}>
                  <Music size={14} />
                  Criar Playlist
                </button>
                {(window as any).showDirectoryPicker ? (
                  <button onClick={handleScanFolderClick}>
                    <Folder size={14} />
                    Adicionar Pasta (PC)
                  </button>
                ) : (
                  <button onClick={handleImportFilesClick}>
                    <FolderUp size={14} />
                    Importar Pasta (Celular)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hidden input for importing files on mobile */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
          multiple
          // @ts-ignore
          webkitdirectory="true"
          directory="true"
        />

        {/* Filter Pills */}
        <div className={styles.filterPillsContainer}>
          <button 
            className={`${styles.filterPill} ${activeFilter === 'all' ? styles.active : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            <span>Tudo</span>
          </button>
          <button 
            className={`${styles.filterPill} ${activeFilter === 'playlist' ? styles.active : ''}`}
            onClick={() => setActiveFilter('playlist')}
          >
            <span>Playlists</span>
          </button>
          <button 
            className={`${styles.filterPill} ${activeFilter === 'album' ? styles.active : ''}`}
            onClick={() => setActiveFilter('album')}
          >
            <span>Álbuns</span>
          </button>
          <button 
            className={`${styles.filterPill} ${activeFilter === 'artist' ? styles.active : ''}`}
            onClick={() => setActiveFilter('artist')}
          >
            <span>Artistas</span>
          </button>
        </div>

        {/* Library Search Bar */}
        <div className={styles.librarySearchContainer}>
          <Search size={14} className={styles.librarySearchIcon} />
          <input 
            type="text" 
            placeholder="Buscar na biblioteca"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.librarySearchInput}
          />
          {searchQuery && (
            <button className={styles.librarySearchClear} onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Library Items List */}
        <div className={styles.libraryContent}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: '0 8px', fontSize: '13px', color: 'var(--text-subdued)', textAlign: 'center', marginTop: '24px' }}>
              {isLoading ? 'Carregando itens da biblioteca…' : 'Nenhum item encontrado.'}
            </div>
          ) : (
            filteredItems.map(item => {
              const active = isItemActive(item);
              const showDelete = item.type === 'playlist' || item.type === 'folder';

              return (
                <div 
                  key={item.id} 
                  className={`${styles.folderItem} ${active ? styles.folderActive : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  <div className={styles.folderInfo}>
                    {/* Render matching art/icon */}
                    {item.type === 'folder' ? (
                      <div className={`${styles.libraryAvatar} ${styles.folder}`}>
                        <Folder size={18} />
                      </div>
                    ) : item.type === 'artist' ? (
                      item.coverArt ? (
                        <img src={item.coverArt} alt={item.name} className={`${styles.libraryAvatar} ${styles.artist}`} />
                      ) : (
                        <div className={`${styles.libraryAvatar} ${styles.artist} ${styles.placeholder}`}>
                          <User size={18} />
                        </div>
                      )
                    ) : (
                      item.coverArt ? (
                        <img src={item.coverArt} alt={item.name} className={`${styles.libraryAvatar} ${styles.album}`} />
                      ) : (
                        <div className={`${styles.libraryAvatar} ${styles.album} ${styles.placeholder}`}>
                          {item.type === 'playlist' ? <Music size={18} /> : <Disc size={18} />}
                        </div>
                      )
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div 
                        className={styles.folderName} 
                        style={{ color: active ? 'var(--spotify-green)' : 'var(--text-base)' }}
                        title={item.name}
                      >
                        {item.name}
                      </div>
                      <div className={styles.folderCount}>{item.subtext}</div>
                    </div>
                  </div>

                  {showDelete && (
                    <button 
                      className={styles.deleteBtn} 
                      title={item.type === 'playlist' ? 'Excluir playlist' : 'Remover pasta'}
                      onClick={(e) => handleItemDelete(e, item)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Download Queue Panel */}
        {isOnlineCapable() && downloadQueue && downloadQueue.length > 0 && (
          <div className="download-queue-panel" style={{
            margin: '12px 8px 4px 8px',
            padding: '10px 12px',
            backgroundColor: '#181818',
            borderRadius: '8px',
            border: '1px solid #282828',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeDownloadsCount > 0 ? (
                  <Loader2 size={13} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)', flexShrink: 0 }} />
                ) : (
                  <Check size={13} color="var(--spotify-green)" style={{ flexShrink: 0 }} />
                )}
                {activeDownloadsCount > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.2 }}>
                    <span>Baixando {completedCount}/{totalCount}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-subdued)', fontWeight: 'normal' }}>
                      {[
                        resolvingCount > 0 && `Resolvendo: ${resolvingCount}`,
                        downloadingCount > 0 && `Baixando: ${downloadingCount}`,
                        packagingCount > 0 && `Empacotando: ${packagingCount}`,
                        pendingCount > 0 && `Na fila: ${pendingCount}`
                      ].filter(Boolean).join(' | ')}
                    </span>
                  </div>
                ) : (
                  `Concluído ${completedCount}/{totalCount}`
                )}
              </span>
              {activeDownloadsCount === 0 && (
                <button 
                  onClick={clearDownloadQueue}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-subdued)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    padding: '0 4px',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Fechar painel"
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-base)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-subdued)'}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#3e3e3e',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${percent}%`,
                height: '100%',
                backgroundColor: 'var(--spotify-green)',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Library Update Loading Panel */}
        {libraryStatus.phase === 'permission-required' && (
          <div className="library-loading-panel" role="alert" style={{ margin: '12px 8px 4px', padding: '10px 12px', backgroundColor: '#2a2114', borderRadius: '8px', border: '1px solid #6e5428' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Permissão da pasta necessária</div>
            <button type="button" onClick={() => void reauthorizeLibraryFolder()} style={{ width: '100%', border: 0, borderRadius: '14px', padding: '6px 10px', fontWeight: 700, cursor: 'pointer' }}>
              Reautorizar pasta
            </button>
          </div>
        )}

        {isLoading && libraryStatus.phase !== 'permission-required' && (
          <div className="library-loading-panel" role="status" aria-live="polite" style={{
            margin: '12px 8px 4px 8px',
            padding: '10px 12px',
            backgroundColor: '#181818',
            borderRadius: '8px',
            border: '1px solid #282828',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={13} style={{ animation: 'spin 1s infinite linear', color: 'var(--spotify-green)', flexShrink: 0 }} />
                {libraryStatus.phase === 'initializing'
                  ? 'Carregando biblioteca...'
                  : libraryStatus.phase === 'selecting'
                    ? 'Selecionando pasta...'
                    : activeScanStatus?.total
                      ? `${activeScanStatus.processed || 0} de ${activeScanStatus.total} arquivos`
                      : 'Localizando arquivos...'}
              </span>
              {activeScanStatus && (
                <button
                  type="button"
                  onClick={cancelLibraryScan}
                  aria-label="Cancelar varredura da biblioteca"
                  title="Cancelar varredura"
                  style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--text-subdued)', cursor: 'pointer', padding: '2px' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#3e3e3e',
              borderRadius: '2px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {activeScanStatus?.total ? (
                <div
                  role="progressbar"
                  aria-label="Progresso da varredura da biblioteca"
                  aria-valuemin={0}
                  aria-valuemax={activeScanStatus.total}
                  aria-valuenow={activeScanStatus.processed || 0}
                  style={{ width: `${Math.round(((activeScanStatus.processed || 0) / activeScanStatus.total) * 100)}%`, height: '100%', backgroundColor: 'var(--spotify-green)', transition: 'width 0.2s ease' }}
                />
              ) : (
                <div className={styles.indeterminateProgressBar} />
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
