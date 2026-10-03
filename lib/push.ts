import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Last registration outcome, for the dev diagnostics line on the notification settings screen. */
export let pushStatus = 'not attempted';

/**
 * Hands the Expo push token to the server. With `prompt`, asks for permission first; we only do that
 * at a moment with obvious value (joining a challenge), never cold on launch.
 */
export async function registerPush({ prompt = false } = {}) {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('challenges', {
      name: 'Challenges',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#D7FF3A',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.status === 'granted' || !prompt ? current.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') {
    pushStatus = `permission ${status}`;
    return;
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  // Without an EAS project id (before `eas init`) there is no push token to fetch.
  if (!projectId) {
    pushStatus = 'no EAS projectId';
    return;
  }
  try {
    pushStatus = 'requesting token…';
    // Simulators (and devices without a network path to APNs/FCM) can wait forever here; give up cleanly.
    const { data } = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out waiting for a device push token')), 15000)),
    ]);
    await api.updateMe({ pushToken: data });
    pushStatus = `registered ${data.slice(0, 28)}…`;
  } catch (e) {
    pushStatus = `error: ${(e as Error).message}`;
    throw e;
  }
}
