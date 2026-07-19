import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { PlaybackProvider, usePlayback } from '../PlaybackContext';

describe('PlaybackContext', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <PlaybackProvider>{children}</PlaybackProvider>
  );

  beforeEach(() => {
    localStorage.clear();
  });

  it('throws error when used outside provider', () => {
    expect(() => renderHook(() => usePlayback())).toThrow(
      'usePlayback must be used within a PlaybackProvider'
    );
  });

  it('returns default values', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });

    expect(result.current.currentTrack).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.volume).toBe(0.5);
  });

  it('reads volume from localStorage', () => {
    localStorage.setItem('spotify_local_volume', '0.8');

    const { result } = renderHook(() => usePlayback(), { wrapper });
    expect(result.current.volume).toBe(0.8);
  });

  it('updates currentTrack', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    const track = { id: '1', title: 'Song', artist: 'Artist', album: 'Album', duration: 180, fileName: 'song.mp3', filePath: '/song.mp3', lastModified: 0, hasLrcFile: false };

    act(() => result.current.setCurrentTrack(track));
    expect(result.current.currentTrack).toEqual(track);
  });

  it('toggles isPlaying', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });

    act(() => result.current.setIsPlaying(true));
    expect(result.current.isPlaying).toBe(true);

    act(() => result.current.setIsPlaying(false));
    expect(result.current.isPlaying).toBe(false);
  });

  it('updates volume', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });

    act(() => result.current.setVolume(0.7));
    expect(result.current.volume).toBe(0.7);
  });
});
