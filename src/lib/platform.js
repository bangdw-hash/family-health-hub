import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';

export const isNativeApp = Capacitor.isNativePlatform();
export const currentPlatform = Capacitor.getPlatform();

/** 외부 URL을 열거나 인증 정보를 노출하지 않는 생명주기 연결. */
export function installNativeLifecycle({onResume, onPause, onBack}) {
  if (!isNativeApp) return () => {};
  const listeners = [];
  App.addListener('resume', () => onResume?.()).then(l => listeners.push(l));
  App.addListener('pause', () => onPause?.()).then(l => listeners.push(l));
  App.addListener('backButton', () => onBack?.()).then(l => listeners.push(l));
  return () => { for (const l of listeners) l.remove(); };
}
export function exitApp() { if (isNativeApp) App.exitApp(); }
