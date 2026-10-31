import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Capacitor Preferences stores non-sensitive display settings only.
 * Auth tokens remain managed by Supabase's auth client until a secure
 * storage adapter and cross-account cache clearing are implemented.
 */
export async function saveDevicePreference(name, value) {
  if (!Capacitor.isNativePlatform()) return;
  if (!/^(theme|font|buttonSize)$/.test(name)) throw new Error('Unsupported preference');
  await Preferences.set({key:'fhh:device:'+name,value:String(value)});
}
export async function readDevicePreference(name) {
  if (!Capacitor.isNativePlatform()) return null;
  if (!/^(theme|font|buttonSize)$/.test(name)) throw new Error('Unsupported preference');
  const result=await Preferences.get({key:'fhh:device:'+name});
  return result.value;
}
