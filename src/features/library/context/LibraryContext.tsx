import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import type { Track } from '../../../shared/types';
import { deduplicateTracks } from '../../../utils/libraryEngine';

export type LibraryStatus =
  | { phase: 'initializing' }
  | { phase: 'idle' }
  | { phase: 'refreshing'; folder?: string; processed?: number; total?: number }
  | { phase: 'selecting' }
  | { phase: 'scanning'; folder?: string; processed?: number; total?: number }
  | { phase: 'permission-required'; folder: string }
  | { phase: 'error'; message: string };

interface LibraryContextType {
  tracks: Track[];
  setTracks: (value: React.SetStateAction<Track[]>) => void;
  tracksRef: React.MutableRefObject<Track[]>;
  folders: string[];
  setFolders: React.Dispatch<React.SetStateAction<string[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  libraryStatus: LibraryStatus;
  setLibraryStatus: React.Dispatch<React.SetStateAction<LibraryStatus>>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
}

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tracks, setTracksState] = useState<Track[]>([]);
  const tracksRef = useRef<Track[]>([]);

  const setTracks = useCallback((value: React.SetStateAction<Track[]>) => {
    setTracksState(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      const deduplicated = deduplicateTracks(next);
      tracksRef.current = deduplicated;
      return deduplicated;
    });
  }, []);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const [folders, setFolders] = useState<string[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>({ phase: 'initializing' });
  const isLoading = ['initializing', 'refreshing', 'selecting', 'scanning'].includes(libraryStatus.phase);
  const setIsLoading: React.Dispatch<React.SetStateAction<boolean>> = useCallback((value) => {
    setLibraryStatus(previous => {
      const loading = typeof value === 'function' ? value(['initializing', 'refreshing', 'selecting', 'scanning'].includes(previous.phase)) : value;
      return loading ? { phase: 'scanning' } : { phase: 'idle' };
    });
  }, []);

  return (
    <LibraryContext.Provider
      value={{
        tracks,
        setTracks,
        tracksRef,
        folders,
        setFolders,
        isLoading,
        setIsLoading,
        libraryStatus,
        setLibraryStatus,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
};
