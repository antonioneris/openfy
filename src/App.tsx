import { useEffect, useState } from 'react'
import { MediaLibraryProvider, useMediaLibrary } from './context/MediaLibraryContext'
import { Sidebar } from './features/library/components/Sidebar'
import { MainContent } from './app/router/ViewRouter'
import { PlayerBar } from './features/playback/components/PlayerBar'
import { BottomNav } from './components/ui/BottomNav'
import { MiniPlayer } from './features/miniPlayer/components/MiniPlayer'
import './shared/types'
import { recordFirstContentMetric } from './services/performanceMetrics'

function AppContent() {
  const [electronClass, setElectronClass] = useState('');
  const { isMiniPlayer } = useMediaLibrary();

  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      setElectronClass(`is-electron platform-${window.electronAPI.platform}`);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(recordFirstContentMetric);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (isMiniPlayer) {
    return (
      <div className={`mini-player-container ${electronClass}`}>
        <MiniPlayer />
      </div>
    );
  }

  return (
    <div className={`app-container ${electronClass}`}>
      {window.electronAPI?.isElectron && <div className="electron-titlebar" />}
      <Sidebar />
      <MainContent />
      <PlayerBar />
      <BottomNav />
    </div>
  );
}

import { AppProviders } from './app/AppProviders'

function App() {
  return (
    <AppProviders>
      <MediaLibraryProvider>
        <AppContent />
      </MediaLibraryProvider>
    </AppProviders>
  )
}

export default App
