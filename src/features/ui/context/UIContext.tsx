import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ModalConfig } from '../../../shared/types';
import type { LyricLine } from '../../../utils/lrcParser';

interface UIContextType {
  isMiniPlayer: boolean;
  enterMiniPlayer: () => void;
  exitMiniPlayer: () => void;
  isCasting: boolean;
  setIsCasting: (casting: boolean) => void;
  modalConfig: ModalConfig | null;
  setModalConfig: React.Dispatch<React.SetStateAction<ModalConfig | null>>;
  promptInputValue: string;
  setPromptInputValue: React.Dispatch<React.SetStateAction<string>>;
  lyrics: LyricLine[];
  setLyrics: React.Dispatch<React.SetStateAction<LyricLine[]>>;
  showAlert: (title: string, message: string) => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
  showPrompt: (title: string, message: string, defaultValue?: string) => Promise<string | null>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);
  const [promptInputValue, setPromptInputValue] = useState('');
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);

  useEffect(() => {
    const api = window.electronAPI as any;
    if (api?.onMiniPlayerChanged) {
      const cleanup = api.onMiniPlayerChanged((isMini: boolean) => {
        setIsMiniPlayer(isMini);
      });
      return cleanup;
    }
  }, []);

  const enterMiniPlayer = () => {
    const api = window.electronAPI as any;
    if (api?.enterMiniPlayer) {
      api.enterMiniPlayer();
    } else {
      setIsMiniPlayer(true);
    }
  };

  const exitMiniPlayer = () => {
    const api = window.electronAPI as any;
    if (api?.exitMiniPlayer) {
      api.exitMiniPlayer();
    } else {
      setIsMiniPlayer(false);
    }
  };

  const showAlert = (title: string, message: string): Promise<void> => {
    return new Promise((resolve) => {
      setModalConfig({ type: 'alert', title, message, resolve });
    });
  };

  const showConfirm = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalConfig({ type: 'confirm', title, message, resolve });
    });
  };

  const showPrompt = (title: string, message: string, defaultValue = ''): Promise<string | null> => {
    setPromptInputValue(defaultValue);
    return new Promise((resolve) => {
      setModalConfig({ type: 'prompt', title, message, defaultValue, resolve });
    });
  };

  return (
    <UIContext.Provider
      value={{
        isMiniPlayer,
        enterMiniPlayer,
        exitMiniPlayer,
        isCasting,
        setIsCasting,
        modalConfig,
        setModalConfig,
        promptInputValue,
        setPromptInputValue,
        lyrics,
        setLyrics,
        showAlert,
        showConfirm,
        showPrompt,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};
