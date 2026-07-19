export interface Track {
  id: string; // Unique ID (e.g., file path or hash)
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  trackNumber?: number;
  year?: number;
  coverArt?: string; // Data URL (Base64)
  embeddedLyrics?: string; // Embedded USLT lyrics
  fileName: string;
  filePath: string; // Relative path in the scanned directory
  lastModified: number;
  hasLrcFile: boolean;
  lrcContent?: string; // Preloaded or loaded on play
  playCount?: number;
  lastPlayed?: number;
  isFavorite?: boolean;
  genre?: string;
  // Persistent reference to the file
  fileHandle?: FileSystemFileHandle; // Desktop
  fileBlob?: File; // Mobile / In-memory fallback
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  coverUrl?: string;
  ytPlaylistId?: string;
}

export interface LibraryState {
  tracks: Track[];
  folders: string[]; // List of scanned folder names
}
