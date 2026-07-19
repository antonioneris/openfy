import React, { createContext, useContext, useState } from 'react';
import type { Track } from '../../../shared/types';

interface QueueContextType {
  queue: Track[];
  setQueue: React.Dispatch<React.SetStateAction<Track[]>>;
  queueIndex: number;
  setQueueIndex: React.Dispatch<React.SetStateAction<number>>;
  isShuffle: boolean;
  setIsShuffle: React.Dispatch<React.SetStateAction<boolean>>;
  repeatMode: 'none' | 'all' | 'one';
  setRepeatMode: React.Dispatch<React.SetStateAction<'none' | 'all' | 'one'>>;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

export function useQueue() {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
}

export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('none');

  return (
    <QueueContext.Provider
      value={{
        queue,
        setQueue,
        queueIndex,
        setQueueIndex,
        isShuffle,
        setIsShuffle,
        repeatMode,
        setRepeatMode,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};
