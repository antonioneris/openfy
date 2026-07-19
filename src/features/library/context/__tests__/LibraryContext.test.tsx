import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { LibraryProvider, useLibrary } from '../LibraryContext';

describe('LibraryContext status', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <LibraryProvider>{children}</LibraryProvider>
  );

  it('starts in initialization instead of reporting an empty ready library', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });

    expect(result.current.libraryStatus).toEqual({ phase: 'initializing' });
    expect(result.current.isLoading).toBe(true);
  });

  it('preserves a permission-required state as a distinct user action', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });

    act(() => result.current.setLibraryStatus({
      phase: 'permission-required',
      folder: '/Volumes/music'
    }));

    expect(result.current.libraryStatus).toEqual({
      phase: 'permission-required',
      folder: '/Volumes/music'
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps numeric scan progress in the loading state', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });

    act(() => result.current.setLibraryStatus({
      phase: 'scanning',
      folder: '/Music',
      processed: 7,
      total: 10,
    }));

    expect(result.current.libraryStatus).toEqual({
      phase: 'scanning',
      folder: '/Music',
      processed: 7,
      total: 10,
    });
    expect(result.current.isLoading).toBe(true);
  });
});
