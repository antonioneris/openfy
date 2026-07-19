import React from 'react';
import { NavigationProvider } from '../features/navigation/context/NavigationContext';
import { LibraryProvider } from '../features/library/context/LibraryContext';
import { PlaylistProvider } from '../features/playlists/context/PlaylistContext';
import { QueueProvider } from '../features/queue/context/QueueContext';
import { PlaybackProvider } from '../features/playback/context/PlaybackContext';
import { SearchProvider } from '../features/search/context/SearchContext';
import { DownloadProvider } from '../features/downloads/context/DownloadContext';
import { UIProvider } from '../features/ui/context/UIContext';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <NavigationProvider>
      <LibraryProvider>
        <PlaylistProvider>
          <QueueProvider>
            <PlaybackProvider>
              <SearchProvider>
                <DownloadProvider>
                  <UIProvider>
                    {children}
                  </UIProvider>
                </DownloadProvider>
              </SearchProvider>
            </PlaybackProvider>
          </QueueProvider>
        </PlaylistProvider>
      </LibraryProvider>
    </NavigationProvider>
  );
};
