import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { NavigationProvider, useNavigation } from '../NavigationContext';

describe('NavigationContext', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <NavigationProvider>{children}</NavigationProvider>
  );

  it('throws error when used outside provider', () => {
    expect(() => renderHook(() => useNavigation())).toThrow(
      'useNavigation must be used within a NavigationProvider'
    );
  });

  it('defaults to home view', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });

    expect(result.current.currentView).toBe('home');
    expect(result.current.viewParams).toEqual({});
  });

  it('navigates to a view with params', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });

    act(() => result.current.setView('album', { id: '123' }));
    expect(result.current.currentView).toBe('album');
    expect(result.current.viewParams).toEqual({ id: '123' });
  });

  it('navigates back', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });

    act(() => result.current.setView('artist', { id: '456' }));
    act(() => result.current.setView('album', { id: '789' }));
    expect(result.current.currentView).toBe('album');

    act(() => result.current.goBack());
    expect(result.current.currentView).toBe('artist');
    expect(result.current.viewParams).toEqual({ id: '456' });
  });

  it('stays at home when going back from home', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });

    act(() => result.current.goBack());
    expect(result.current.currentView).toBe('home');
  });

  it('resets history when navigating to home', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });

    act(() => result.current.setView('artist', { id: '1' }));
    act(() => result.current.setView('album', { id: '2' }));
    act(() => result.current.setView('home'));
    expect(result.current.currentView).toBe('home');

    act(() => result.current.goBack());
    expect(result.current.currentView).toBe('home');
  });
});
