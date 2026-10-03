import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { Types } from 'mongoose';

import type { NotificationKind } from '../../shared/contracts.js';

import { Notification, User } from './models.js';
import { redis } from './redis.js';

const expo = new Expo();

type Msg = { title: string; body: string; data?: Record<string, string> };

/**
 * Fire-and-forget notification: always written to the in-app inbox, and pushed to the phone
 * if the user has that kind switched on. With `throttleKey`, at most one per user per key per hour,
 * so a busy leaderboard can't spam anyone.
 */
export function notify(userId: Types.ObjectId | string, kind: NotificationKind, msg: Msg, throttleKey?: string) {
  void deliver(String(userId), kind, msg, throttleKey).catch((e) => console.error('notify', e));
}

export async function deliver(userId: string, kind: NotificationKind, msg: Msg, throttleKey?: string) {
  if (throttleKey) {
    const ok = await redis().set(`notify:${userId}:${throttleKey}`, '1', 'EX', 3600, 'NX');
    if (!ok) return;
  }
  await Notification.create({ userId, kind, title: msg.title, body: msg.body, data: msg.data });
  const user = await User.findById(userId, { pushToken: 1, notifPrefs: 1 }).lean();
  const prefs = (user?.notifPrefs ?? {}) as Partial<Record<NotificationKind, boolean>>;
  if (prefs[kind] === false) return;
  const to = user?.pushToken;
  if (!to || !Expo.isExpoPushToken(to)) return;
  const unread = await Notification.countDocuments({ userId, readAt: { $exists: false } });
  const message: ExpoPushMessage = { to, title: msg.title, body: msg.body, data: { ...msg.data, kind }, sound: 'default', channelId: 'challenges', badge: unread };
  await expo.sendPushNotificationsAsync([message]);
}
