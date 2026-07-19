import React from 'react';
import { useMediaLibrary } from '../../context/MediaLibraryContext';
import { HomeView } from '../../features/home/components/HomeView';
import { AlbumView } from '../../features/albums/components/AlbumView';
import { ArtistView } from '../../features/artists/components/ArtistView';
import { FolderView } from '../../features/library/components/FolderView';
import { SearchView } from '../../features/search/components/SearchView';
import { LyricsView } from '../../features/lyrics/components/LyricsView';
import { PlaylistView } from '../../features/playlists/components/PlaylistView';
import { FullscreenView } from '../../features/fullscreen/components/FullscreenView';
import { SettingsView } from '../../features/settings/components/SettingsView';
import { QueueView } from '../../features/queue/components/QueueView';
import { LibraryView } from '../../features/library/components/LibraryView';

export const MainContent: React.FC = () => {
  const { currentView } = useMediaLibrary();

  if (currentView === 'fullscreen') {
    return <FullscreenView />;
  }

  const renderActiveView = () => {
    switch (currentView) {
      case 'home':
        return <HomeView />;
      case 'album':
        return <AlbumView />;
      case 'artist':
        return <ArtistView />;
      case 'folder':
        return <FolderView />;
      case 'search':
        return <SearchView />;
      case 'lyrics':
        return <LyricsView />;
      case 'playlist':
        return <PlaylistView />;
      case 'settings':
        return <SettingsView />;
      case 'queue':
        return <QueueView />;
      case 'library':
        return <LibraryView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <main className="main-view">
      {/* Dynamic gradient background */}
      {currentView !== 'lyrics' && <div className="main-header-gradient" />}
      
      {/* Content wrapper */}
      <div className="main-content-inner" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {renderActiveView()}
      </div>


    </main>
  );
};
