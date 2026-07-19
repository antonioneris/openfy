import { useState, useEffect } from 'react';
import { getPlatform } from '../services/platformService';
import type { Platform } from '../services/platformService';

export function usePlatform() {
  const [platform, setPlatform] = useState<Platform>('browser');

  useEffect(() => {
    setPlatform(getPlatform());
  }, []);

  return {
    platform,
    isElectron: platform === 'electron',
    isAndroid: platform === 'android',
    isBrowser: platform === 'browser',
    isOnlineCapable: platform !== 'android',
  };
}
