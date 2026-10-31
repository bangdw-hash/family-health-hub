import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNativeApp = Capacitor.isNativePlatform();
export const currentPlatform = Capacitor.getPlatform();

/** Opens no external URLs and avoids leaking authenticated app data. */
export function installNativeLifecycle({onResume, onBack}) {
  if (!isNativeApp) return () => {};
  const listeners = [];
  App.addListener('resume', () => onResume?.()).then(listener => listeners.push(listener));
  App.addListener('backButton', () => onBack?.()).then(listener => listeners.push(listener));
  return () => { for (const listener of listeners) listener.remove(); };
}
