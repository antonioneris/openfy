import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueueProvider, useQueue } from '../QueueContext';

describe('QueueContext', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueueProvider>{children}</QueueProvider>
  );

  it('throws error when used outside provider', () => {
    expect(() => renderHook(() => useQueue())).toThrow(
      'useQueue must be used within a QueueProvider'
    );
  });

  it('returns default values', () => {
    const { result } = renderHook(() => useQueue(), { wrapper });

    expect(result.current.queue).toEqual([]);
    expect(result.current.queueIndex).toBe(-1);
    expect(result.current.isShuffle).toBe(false);
    expect(result.current.repeatMode).toBe('none');
  });

  it('updates queue', () => {
    const { result } = renderHook(() => useQueue(), { wrapper });
    const tracks = [
      { id: '1', title: 'A', artist: 'X', album: 'Y', duration: 100, fileName: 'a.mp3', filePath: '/a.mp3', lastModified: 0, hasLrcFile: false },
      { id: '2', title: 'B', artist: 'X', album: 'Y', duration: 200, fileName: 'b.mp3', filePath: '/b.mp3', lastModified: 0, hasLrcFile: false },
    ];

    act(() => result.current.setQueue(tracks));
    expect(result.current.queue).toHaveLength(2);
  });

  it('cycles through repeat modes', () => {
    const { result } = renderHook(() => useQueue(), { wrapper });

    act(() => result.current.setRepeatMode('all'));
    expect(result.current.repeatMode).toBe('all');

    act(() => result.current.setRepeatMode('one'));
    expect(result.current.repeatMode).toBe('one');

    act(() => result.current.setRepeatMode('none'));
    expect(result.current.repeatMode).toBe('none');
  });

  it('toggles shuffle', () => {
    const { result } = renderHook(() => useQueue(), { wrapper });

    act(() => result.current.setIsShuffle(true));
    expect(result.current.isShuffle).toBe(true);
  });

  it('updates queueIndex', () => {
    const { result } = renderHook(() => useQueue(), { wrapper });

    act(() => result.current.setQueueIndex(3));
    expect(result.current.queueIndex).toBe(3);
  });
});
