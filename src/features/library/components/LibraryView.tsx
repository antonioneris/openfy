import React, { useState, useRef, useEffect } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { 
  Folder, Plus, Search, X, FolderUp, 
  Music, Disc, User, Trash2 
} from 'lucide-react';
import styles from '../styles/LibraryView.module.css';

type FilterType = 'all' | 'playlist' | 'album' | 'artist' | 'folder';

interface LibraryItem {
  type: 'album' | 'artist' | 'playlist' | 'folder';
  id: string;
  name: string;
  subtext: string;
  coverArt?: string;
  originalFolder?: string;
}

export const LibraryView: React.FC = () => {
  const {
    tracks,
    playlists,
    folders,
    setView,
    currentView,
    viewParams,
    createPlaylist,
    deletePlaylist,
    deleteFolder,
    scanLocalFolder,
    importLocalFiles,
    showConfirm,
    showPrompt
  } = useMediaLibrary();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusDropdownRef = useRef<HTMLDivElement>(null);

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Close plus dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (plusDropdownRef.current && !plusDropdownRef.current.contains(event.target as Node)) {
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
        'Deseja salvar estes arquivos de áudio (.mp3, .m4a) no armazenamento do seu dispositivo?\n\nEles estarão disponíveis automaticamente da próxima vez.'
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
      let coverArt: string | undefined;
      for (const id of playlist.trackIds) {
        const track = tracks.find(t => t.id === id);
        if (track && track.coverArt) {
          coverArt = track.coverArt;
          break;
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

    // 2. Local Folders
    folders.forEach(folder => {
      items.push({
        type: 'folder',
        id: `folder_${folder}`,
        name: folder.split('/').pop() || folder,
        subtext: 'Pasta Local',
        originalFolder: folder
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
        setView('folder', { name: item.originalFolder || item.name });
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
    <div className={styles.mobileLibraryView}>
      {/* Hidden file inputs */}
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

      {/* Header */}
      <div className={styles.mobileLibraryHeader}>
        <div className={styles.libraryHeaderLeft}>
          <div className={styles.libraryProfileAvatar}>
            <User size={18} />
          </div>
          <h1>Sua Biblioteca</h1>
        </div>
        
        <div className={styles.libraryHeaderRight} ref={plusDropdownRef}>
          <button 
            className={styles.libraryHeaderBtn} 
            onClick={() => setIsSearching(!isSearching)}
            title="Buscar"
          >
            <Search size={22} />
          </button>
          
          <button 
            className={styles.libraryHeaderBtn} 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            title="Adicionar"
          >
            <Plus size={24} />
          </button>

          {/* Plus Dropdown Menu */}
          {isDropdownOpen && (
            <div className={styles.libraryPlusDropdown}>
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

      {/* Search Input Bar (Conditional) */}
      {isSearching && (
        <div className={styles.libraryMobileSearchBar}>
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Buscar na biblioteca"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button className="clear-btn" onClick={() => {
            setSearchQuery('');
            setIsSearching(false);
          }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter Pills */}
      <div className={styles.mobileLibraryFilters}>
        <button 
          className={`${styles.filterPill} ${activeFilter === 'all' ? styles.active : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          Tudo
        </button>
        <button 
          className={`${styles.filterPill} ${activeFilter === 'playlist' ? styles.active : ''}`}
          onClick={() => setActiveFilter('playlist')}
        >
          Playlists
        </button>
        <button 
          className={`${styles.filterPill} ${activeFilter === 'album' ? styles.active : ''}`}
          onClick={() => setActiveFilter('album')}
        >
          Álbuns
        </button>
        <button 
          className={`${styles.filterPill} ${activeFilter === 'artist' ? styles.active : ''}`}
          onClick={() => setActiveFilter('artist')}
        >
          Artistas
        </button>
        {folders.length > 0 && (
          <button 
            className={`${styles.filterPill} ${activeFilter === 'folder' ? styles.active : ''}`}
            onClick={() => setActiveFilter('folder')}
          >
            Pastas
          </button>
        )}
      </div>

      {/* Library Items List */}
      <div className={styles.mobileLibraryList}>
        {filteredItems.length === 0 ? (
          <div className={styles.libraryEmptyMessage}>
            Nenhum item encontrado na biblioteca.
          </div>
        ) : (
          filteredItems.map(item => {
            const active = isItemActive(item);
            const showDelete = item.type === 'playlist' || item.type === 'folder';

            return (
              <div 
                key={item.id} 
                className={`${styles.mobileLibraryItem} ${active ? styles.active : ''}`}
                onClick={() => handleItemClick(item)}
              >
                {/* Render matching art/icon */}
                {item.type === 'folder' ? (
                  <div className={`${styles.libraryAvatar} ${styles.folder}`}>
                    <Folder size={20} />
                  </div>
                ) : item.type === 'artist' ? (
                  item.coverArt ? (
                    <img src={item.coverArt} alt={item.name} className={`${styles.libraryAvatar} ${styles.artist}`} />
                  ) : (
                    <div className={`${styles.libraryAvatar} ${styles.artist} ${styles.placeholder}`}>
                      <User size={20} />
                    </div>
                  )
                ) : (
                  item.coverArt ? (
                    <img src={item.coverArt} alt={item.name} className={`${styles.libraryAvatar} ${styles.album}`} />
                  ) : (
                    <div className={`${styles.libraryAvatar} ${styles.album} ${styles.placeholder}`}>
                      {item.type === 'playlist' ? <Music size={20} /> : <Disc size={20} />}
                    </div>
                  )
                )}

                <div className={styles.itemMeta}>
                  <div className={styles.itemName}>{item.name}</div>
                  <div className={styles.itemSubtext}>{item.subtext}</div>
                </div>

                {showDelete && (
                  <button 
                    className={styles.deleteBtn} 
                    title={item.type === 'playlist' ? 'Excluir playlist' : 'Remover pasta'}
                    onClick={(e) => handleItemDelete(e, item)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
