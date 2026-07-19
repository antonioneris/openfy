import React, { createContext, useContext, useState } from 'react';
import type { QueuedDownload } from '../../../shared/types';

interface DownloadContextType {
  downloadQueue: QueuedDownload[];
  setDownloadQueue: React.Dispatch<React.SetStateAction<QueuedDownload[]>>;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function useDownload() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
}

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloadQueue, setDownloadQueue] = useState<QueuedDownload[]>([]);

  return (
    <DownloadContext.Provider value={{ downloadQueue, setDownloadQueue }}>
      {children}
    </DownloadContext.Provider>
  );
};
