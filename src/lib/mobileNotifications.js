import {Capacitor} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';

/**
 * 알림은 사용자가 설정에서 명시적으로 켠 기기에서만, 사용자가 선택한 환자에 대해서만 예약됩니다.
 * 예약 내용은 이 기기에서 로컬로만 생성되며 서버로 전송되지 않습니다. (푸시 서버 미사용)
 */
export async function requestMedicationNotificationPermission() {
  if (!Capacitor.isNativePlatform()) {
    if (typeof Notification === 'undefined') return {supported: false, granted: false, reason: 'unsupported'};
    const r = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    return {supported: true, granted: r === 'granted'};
  }
  const status = await LocalNotifications.requestPermissions();
  return {supported: true, granted: status.display === 'granted'};
}

export function notificationPermission() {
  if (Capacitor.isNativePlatform()) return 'native';
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function cancelMedicationNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({notifications: pending.notifications.map(x => ({id: x.id}))});
  }
}

/** 네이티브: 기존 예약을 모두 지우고 items([{id,at,title,body}])를 다시 예약합니다. */
export async function scheduleNativeNotifications(items) {
  if (!Capacitor.isNativePlatform()) return false;
  await cancelMedicationNotifications();
  if (!items.length) return true;
  await LocalNotifications.schedule({notifications: items.map(x => ({id: x.id, title: x.title, body: x.body, schedule: {at: x.at, allowWhileIdle: true}}))});
  return true;
}
