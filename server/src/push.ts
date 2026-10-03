import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { Types } from 'mongoose';

import { User } from './models.js';
import { redis } from './redis.js';

const expo = new Expo();

type Msg = { title: string; body: string; data?: Record<string, string> };

/**
 * Fire-and-forget push. With `throttleKey`, at most one push per user per key per hour,
 * so a busy leaderboard can't spam anyone.
 */
export function notify(userId: Types.ObjectId | string, msg: Msg, throttleKey?: string) {
  void send(String(userId), msg, throttleKey).catch((e) => console.error('push', e));
}

async function send(userId: string, msg: Msg, throttleKey?: string) {
  if (throttleKey) {
    const ok = await redis().set(`push:${userId}:${throttleKey}`, '1', 'EX', 3600, 'NX');
    if (!ok) return;
  }
  const user = await User.findById(userId, { pushToken: 1 }).lean();
  const to = user?.pushToken;
  if (!to || !Expo.isExpoPushToken(to)) return;
  const message: ExpoPushMessage = { to, title: msg.title, body: msg.body, data: msg.data, sound: 'default', channelId: 'challenges' };
  await expo.sendPushNotificationsAsync([message]);
}

export async function notifyMany(userIds: (Types.ObjectId | string)[], msg: Msg) {
  for (const id of userIds) notify(id, msg);
}
