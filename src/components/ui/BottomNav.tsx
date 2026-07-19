import React from 'react';
import { useMediaLibrary } from '../../context/MediaLibraryContext';
import { Home, Search, Library } from 'lucide-react';
import { isOnlineCapable } from '../../services/platformService';

export const BottomNav: React.FC = () => {
  const { currentView, setView } = useMediaLibrary();

  // Helper to determine if a view belongs to Library tab
  const isLibraryActive = ['library', 'playlist', 'album', 'artist', 'folder'].includes(currentView);

  return (
    <nav className="mobile-bottom-nav">
      <button
        className={`bottom-nav-item ${currentView === 'home' ? 'active' : ''}`}
        onClick={() => setView('home')}
        aria-label="Início"
        aria-current={currentView === 'home' ? 'page' : undefined}
      >
        <Home size={20} />
        <span>Início</span>
      </button>

      {isOnlineCapable() && (
        <button
          className={`bottom-nav-item ${currentView === 'search' ? 'active' : ''}`}
          onClick={() => setView('search')}
          aria-label="Buscar"
          aria-current={currentView === 'search' ? 'page' : undefined}
        >
          <Search size={20} />
          <span>Buscar</span>
        </button>
      )}

      <button
        className={`bottom-nav-item ${isLibraryActive ? 'active' : ''}`}
        onClick={() => setView('library')}
        aria-label="Sua biblioteca"
        aria-current={isLibraryActive ? 'page' : undefined}
      >
        <Library size={20} />
        <span>Sua biblioteca</span>
      </button>
    </nav>
  );
};
