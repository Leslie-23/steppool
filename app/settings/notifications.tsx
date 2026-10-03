import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button, Card, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { registerPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import type { NotificationKind, NotificationPrefs } from '@/shared/contracts';
import { color, space } from '@/theme/tokens';

const ROWS: { kind: NotificationKind; title: string; body: string }[] = [
  { kind: 'overtake', title: 'Overtakes', body: 'When someone passes you on a leaderboard' },
  { kind: 'goal', title: 'Goal hit', body: 'The moment you lock in your share of the pool' },
  { kind: 'reminder', title: 'Reminders', body: 'Challenge starting, and the final hour' },
  { kind: 'results', title: 'Results', body: 'When a challenge settles and payouts land' },
  { kind: 'joins', title: 'New players', body: 'When someone joins a challenge you created' },
  { kind: 'announcement', title: 'Announcements', body: 'Credit top-ups, new sponsored challenges, big news' },
];

type PushStatus = 'granted' | 'denied' | 'undetermined';

export default function NotificationSettings() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const [status, setStatus] = useState<PushStatus>('undetermined');
  const [prefs, setPrefs] = useState<NotificationPrefs | undefined>(me?.notifPrefs);

  const check = useCallback(() => {
    Notifications.getPermissionsAsync().then((p) => setStatus(p.status as PushStatus));
  }, []);
  useFocusEffect(check);

  const toggle = async (kind: NotificationKind, value: boolean) => {
    haptic.select();
    setPrefs((p) => (p ? { ...p, [kind]: value } : p));
    try {
      setMe(await api.updatePrefs({ [kind]: value }));
    } catch {
      setPrefs((p) => (p ? { ...p, [kind]: !value } : p)); // roll back
      haptic.error();
    }
  };

  const enablePush = async () => {
    if (status === 'denied') return Linking.openSettings(); // iOS only asks once; after that it's Settings.
    await registerPush({ prompt: true }).catch(() => {});
    check();
  };

  return (
    <Screen>
      <Row style={{ marginTop: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <IconSymbol name="chevron.left" size={22} color={color.text} />
        </Pressable>
      </Row>
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxxl }} showsVerticalScrollIndicator={false}>
        <T v="title" style={{ marginTop: space.lg }}>Notifications</T>

        <Card tone={status === 'granted' ? 'volt' : undefined} style={{ gap: space.md }}>
          <Row gap={space.md}>
            <IconSymbol name={status === 'granted' ? 'bell.fill' : 'bell.slash.fill'} size={22} color={status === 'granted' ? color.volt : color.muted} />
            <View style={{ flex: 1 }}>
              <T v="heading" style={{ fontSize: 16 }}>Push notifications {status === 'granted' ? 'on' : 'off'}</T>
              <T v="caption">
                {status === 'granted'
                  ? 'Choose below which ones reach your lock screen.'
                  : status === 'denied'
                    ? 'They’re blocked in iOS Settings. Everything still lands in your in-app inbox.'
                    : 'Get told the moment someone passes you. Everything also lands in your inbox.'}
              </T>
            </View>
          </Row>
          {status !== 'granted' ? <Button label={status === 'denied' ? 'Open Settings' : 'Turn on'} onPress={enablePush} /> : null}
        </Card>

        <View style={{ gap: space.xs }}>
          <T v="label" style={{ marginBottom: space.sm }}>Send me</T>
          {ROWS.map((r) => (
            <Row key={r.kind} gap={space.md} style={styles.row}>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontSize: 15 }}>{r.title}</T>
                <T v="caption">{r.body}</T>
              </View>
              <Switch
                value={prefs?.[r.kind] ?? true}
                onValueChange={(v) => toggle(r.kind, v)}
                trackColor={{ true: color.volt, false: color.raised }}
                thumbColor={color.text}
                ios_backgroundColor={color.raised}
                accessibilityLabel={r.title}
              />
            </Row>
          ))}
          <T v="caption" style={{ fontSize: 11, marginTop: space.sm }}>Switching one off only stops the push. It still appears in your inbox.</T>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
});
