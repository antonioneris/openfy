import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueueView } from '../QueueView';
import { useMediaLibrary } from '../../../../context/MediaLibraryContext';

jest.mock('../../../../context/MediaLibraryContext', () => ({
  useMediaLibrary: jest.fn()
}));

describe('QueueView', () => {
  it('renders queue title and empty state message when empty', () => {
    (useMediaLibrary as jest.Mock).mockReturnValue({
      currentTrack: null,
      isPlaying: false,
      queue: [],
      queueIndex: -1,
      playTrack: jest.fn(),
      togglePlay: jest.fn(),
      removeFromQueue: jest.fn(),
      clearQueue: jest.fn(),
      reorderQueue: jest.fn()
    });

    render(<QueueView />);
    expect(screen.getByText('Fila de reprodução')).toBeInTheDocument();
    expect(screen.getByText('Sua fila está vazia. Adicione músicas à fila a partir do menu "..." das faixas.')).toBeInTheDocument();
  });

  it('renders current track when playing', () => {
    (useMediaLibrary as jest.Mock).mockReturnValue({
      currentTrack: {
        id: '1',
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        coverArt: '',
        filePath: 'test.mp3'
      },
      isPlaying: true,
      queue: [],
      queueIndex: -1,
      playTrack: jest.fn(),
      togglePlay: jest.fn(),
      removeFromQueue: jest.fn(),
      clearQueue: jest.fn(),
      reorderQueue: jest.fn()
    });

    render(<QueueView />);
    expect(screen.getByText('Tocando agora')).toBeInTheDocument();
    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });
});
