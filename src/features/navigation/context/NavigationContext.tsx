import React, { createContext, useContext, useState, useRef } from 'react';
import type { ActiveView, ViewParams } from '../../../shared/types';

interface NavigationContextType {
  currentView: ActiveView;
  viewParams: ViewParams;
  setView: (view: ActiveView, params?: ViewParams) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<ActiveView>('home');
  const [viewParams, setViewParams] = useState<ViewParams>({});
  const historyRef = useRef<{ view: ActiveView; params: ViewParams }[]>([{ view: 'home', params: {} }]);

  const setView = (view: ActiveView, params: ViewParams = {}) => {
    const currentHistory = historyRef.current;
    const last = currentHistory[currentHistory.length - 1];

    if (view === 'home') {
      historyRef.current = [{ view: 'home', params: {} }];
    } else if (!last || last.view !== view || JSON.stringify(last.params) !== JSON.stringify(params)) {
      historyRef.current.push({ view, params });
    }
    setCurrentView(view);
    setViewParams(params);
  };

  const goBack = () => {
    const currentHistory = historyRef.current;
    if (currentHistory.length > 1) {
      currentHistory.pop();
      const prev = currentHistory[currentHistory.length - 1];
      setCurrentView(prev.view);
      setViewParams(prev.params);
    } else {
      setCurrentView('home');
      setViewParams({});
      historyRef.current = [{ view: 'home', params: {} }];
    }
  };

  return (
    <NavigationContext.Provider value={{ currentView, viewParams, setView, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
};
