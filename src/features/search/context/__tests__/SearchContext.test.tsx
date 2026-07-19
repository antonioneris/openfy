import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { SearchProvider, useSearch } from '../SearchContext';

describe('SearchContext', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <SearchProvider>{children}</SearchProvider>
  );

  it('throws error when used outside provider', () => {
    expect(() => renderHook(() => useSearch())).toThrow(
      'useSearch must be used within a SearchProvider'
    );
  });

  it('returns default values', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    expect(result.current.ytSearchQuery).toBe('');
    expect(result.current.ytSearchMode).toBe('local');
    expect(result.current.ytSearchResults).toBeNull();
    expect(result.current.ytSearchCategory).toBe('all');
  });

  it('updates search query', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => result.current.setYtSearchQuery('test song'));
    expect(result.current.ytSearchQuery).toBe('test song');
  });

  it('switches search mode', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => result.current.setYtSearchMode('youtube'));
    expect(result.current.ytSearchMode).toBe('youtube');
  });

  it('sets search results', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    const results = { items: [{ title: 'Found', videoId: 'abc123' }] };

    act(() => result.current.setYtSearchResults(results));
    expect(result.current.ytSearchResults).toEqual(results);
  });
});
