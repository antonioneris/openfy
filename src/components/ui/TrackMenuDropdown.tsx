import React, { useRef, useEffect, useState } from 'react';
import { useMediaLibrary } from '../../context/MediaLibraryContext';
import { MetadataEditorModal } from './MetadataEditorModal';
import {
  Music, ListPlus, PlaySquare, Heart, User,
  Pencil, Trash2, ChevronRight
} from 'lucide-react';

interface TrackMenuDropdownProps {
  trackId: string;
  onClose: () => void;
}

export const TrackMenuDropdown: React.FC<TrackMenuDropdownProps> = ({ trackId, onClose }) => {
  const {
    tracks,
    playlists,
    addTrackToPlaylist,
    addToQueue,
    addToQueueNext,
    toggleTrackFavorite,
    updateTrackMetadata,
    setView,
    showAlert,
    deleteTrack
  } = useMediaLibrary();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showSubmenu, setShowSubmenu] = useState(false);
  const track = tracks.find(t => t.id === trackId);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!track) return null;

  const handlePlayNext = () => {
    addToQueueNext(track);
    onClose();
  };

  const handleAddToQueue = () => {
    addToQueue(track);
    onClose();
  };

  const handlePlaylistSelect = async (playlistId: string, playlistName: string) => {
    await addTrackToPlaylist(playlistId, trackId);
    await showAlert('Música Adicionada', `Música adicionada à playlist "${playlistName}"!`);
    onClose();
  };

  const handleToggleFavorite = async () => {
    await toggleTrackFavorite(track.id);
    onClose();
  };

  const handleViewArtist = () => {
    setView('artist', { name: track.artist });
    onClose();
  };

  const handleEditMetadata = () => {
    setIsEditing(true);
  };

  const handleSaveMetadata = async (metadata: Partial<typeof track>, coverDataUrl?: string | null) => {
    if (window.electronAPI?.updateTrackMetadata && track.filePath) {
      const { success: fileSuccess, error } = await window.electronAPI.updateTrackMetadata({
        filePath: track.filePath,
        metadata: {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          year: metadata.year ?? null,
          trackNumber: metadata.trackNumber ?? null,
          genre: metadata.genre ?? null
        },
        coverArt: coverDataUrl
      });
      if (!fileSuccess) {
        throw new Error(error || 'Não foi possível gravar os metadados no arquivo físico.');
      }
    }

    const success = await updateTrackMetadata(trackId, metadata);
    return success;
  };

  if (isEditing) {
    return (
      <MetadataEditorModal
        type="track"
        item={track}
        isOpen={isEditing}
        onClose={() => {
          setIsEditing(false);
          onClose();
        }}
        onSave={async (metadata, coverDataUrl) => {
          const success = await handleSaveMetadata(metadata, coverDataUrl);
          if (success) {
            setIsEditing(false);
            onClose();
          }
          return success;
        }}
      />
    );
  }

  return (
    <>
      {/* Backdrop overlay for mobile */}
      <div className="track-menu-backdrop" onClick={onClose} />
      
      <div className="add-playlist-dropdown track-menu-dropdown" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
        {/* Mobile Header with Title & Artist (No Cover Art) */}
        <div className="mobile-track-menu-header">
          <div className="mobile-track-menu-info">
            <h3 className="mobile-track-menu-title">{track.title}</h3>
            <p className="mobile-track-menu-artist">{track.artist}</p>
          </div>
        </div>

        <div className="track-menu-section">
          {/* Like / Favorite */}
          <button className="add-playlist-item" onClick={handleToggleFavorite}>
            <Heart size={16} className={`icon ${track.isFavorite ? 'favorite-active' : ''}`} fill={track.isFavorite ? 'var(--spotify-green)' : 'none'} />
            <span className="name">{track.isFavorite ? 'Curtida' : 'Curtir'}</span>
          </button>

          {/* View Artist */}
          <button className="add-playlist-item" onClick={handleViewArtist}>
            <User size={16} className="icon" />
            <span className="name">Ver artista</span>
          </button>

          {/* Edit Metadata */}
          <button className="add-playlist-item" onClick={handleEditMetadata}>
            <Pencil size={16} className="icon" />
            <span className="name">Editar metadados</span>
          </button>

          {/* Play Next */}
          <button className="add-playlist-item" onClick={handlePlayNext}>
            <PlaySquare size={16} className="icon" />
            <span className="name">Tocar a seguir</span>
          </button>

          {/* Add to Queue */}
          <button className="add-playlist-item" onClick={handleAddToQueue}>
            <ListPlus size={16} className="icon" />
            <span className="name">Adicionar à fila</span>
          </button>

          {/* Add to Playlist Submenu */}
          <div 
            className="add-playlist-submenu-container"
            onMouseEnter={() => setShowSubmenu(true)}
            onMouseLeave={() => setShowSubmenu(false)}
            style={{ position: 'relative' }}
          >
            <button 
              className="add-playlist-item" 
              onClick={(e) => {
                e.stopPropagation();
                setShowSubmenu(prev => !prev);
              }}
              style={{ display: 'flex', alignItems: 'center', width: '100%' }}
            >
              <ListPlus size={16} className="icon" />
              <span className="name" style={{ flexGrow: 1 }}>Adicionar à playlist</span>
              <ChevronRight size={16} className="icon submenu-chevron" />
            </button>

            {showSubmenu && (
              <div className="add-playlist-submenu">
                {playlists.length === 0 ? (
                  <div className="add-playlist-empty" style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-subdued)', textAlign: 'center' }}>
                    Nenhuma playlist criada.
                  </div>
                ) : (
                  playlists.map((p) => {
                    const isAlreadyAdded = p.trackIds.includes(trackId);
                    return (
                      <button
                        key={p.id}
                        className={`add-playlist-item ${isAlreadyAdded ? 'added' : ''}`}
                        onClick={() => handlePlaylistSelect(p.id, p.name)}
                        disabled={isAlreadyAdded}
                        title={isAlreadyAdded ? 'Já adicionada' : `Adicionar a ${p.name}`}
                      >
                        <Music size={14} className="icon" />
                        <span className="name">{p.name}</span>
                        {isAlreadyAdded && <span className="badge">Adicionada</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Excluir Música */}
          <button 
            className="add-playlist-item" 
            onClick={async (e) => {
              e.stopPropagation();
              onClose();
              await deleteTrack(track.id);
            }}
            style={{ color: '#e91429' }}
          >
            <Trash2 size={16} className="icon" style={{ color: '#e91429' }} />
            <span className="name" style={{ color: '#e91429' }}>Excluir música</span>
          </button>
        </div>

        {/* Mobile Close Button */}
        <button className="mobile-track-menu-close-btn" onClick={onClose}>
          Fechar
        </button>
      </div>
    </>
  );
};
