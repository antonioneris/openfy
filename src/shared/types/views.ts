export type ActiveView = 'home' | 'search' | 'lyrics' | 'album' | 'artist' | 'folder' | 'playlist' | 'fullscreen' | 'settings' | 'queue' | 'library';

export interface ViewParams {
  id?: string;
  name?: string;
  artist?: string;
  coverUrl?: string;
  source?: 'local' | 'youtube' | 'spotify';
  tracks?: any[];
  year?: number;
}
