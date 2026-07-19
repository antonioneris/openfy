export type Platform = 'electron' | 'android' | 'browser';

let cachedPlatform: Platform | null = null;

export function getPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;
  if (window.electronAPI?.isElectron) {
    cachedPlatform = 'electron';
  } else if (/android/i.test(navigator.userAgent)) {
    cachedPlatform = 'android';
  } else {
    cachedPlatform = 'browser';
  }
  return cachedPlatform;
}

export const isElectron = (): boolean => getPlatform() === 'electron';
export const isAndroid = (): boolean => getPlatform() === 'android';
export const isOnlineCapable = (): boolean => getPlatform() !== 'android';
