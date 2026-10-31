import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Only call from the authenticated patient's own device and after explicit
 * permission. Caregiver devices must never receive patient medication alerts.
 * This module intentionally does not automatically schedule reminders.
 */
export async function requestMedicationNotificationPermission() {
  if (!Capacitor.isNativePlatform()) {
    return {supported:false,granted:false,reason:'native_only'};
  }
  const status = await LocalNotifications.requestPermissions();
  return {supported:true,granted:status.display === 'granted'};
}

export async function cancelMedicationNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({notifications:pending.notifications.map(x=>({id:x.id}))});
  }
}
