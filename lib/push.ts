import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Asks for notification permission and hands the Expo push token to the server. */
export async function registerPush() {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('challenges', {
      name: 'Challenges',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#D7FF3A',
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  // Without an EAS project id (before `eas init`) there is no push token to fetch.
  if (!projectId) return;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.updateMe({ pushToken: data });
}
