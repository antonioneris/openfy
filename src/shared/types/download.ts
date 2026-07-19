export interface QueuedDownload {
  videoId: string;
  name: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number | null;
  genre?: string;
  year?: number | null;
  status: 'pending' | 'resolving' | 'downloading' | 'packaging' | 'completed' | 'error';
  progress?: number;
}
