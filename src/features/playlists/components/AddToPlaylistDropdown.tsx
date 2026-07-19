import React, { useRef, useEffect } from 'react';
import { useMediaLibrary } from '../../../context/MediaLibraryContext';
import { Music } from 'lucide-react';

interface AddToPlaylistDropdownProps {
  trackId: string;
  onClose: () => void;
}

export const AddToPlaylistDropdown: React.FC<AddToPlaylistDropdownProps> = ({ trackId, onClose }) => {
  const { playlists, addTrackToPlaylist, showAlert } = useMediaLibrary();
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handlePlaylistSelect = async (playlistId: string, playlistName: string) => {
    await addTrackToPlaylist(playlistId, trackId);
    await showAlert('Música Adicionada', `Música adicionada à playlist "${playlistName}"!`);
    onClose();
  };

  return (
    <div className="add-playlist-dropdown" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <div className="add-playlist-header">Adicionar à playlist</div>
      <div className="add-playlist-list">
        {playlists.length === 0 ? (
          <div className="add-playlist-empty">
            Nenhuma playlist criada. Crie uma na barra lateral.
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
                title={isAlreadyAdded ? 'Já adicionada a esta playlist' : `Adicionar a ${p.name}`}
              >
                <Music size={14} className="icon" />
                <span className="name">{p.name}</span>
                {isAlreadyAdded && <span className="badge">Adicionada</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
