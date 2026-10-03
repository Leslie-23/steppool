import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { haptic } from '@/lib/haptics';
import { hrefFor, useInbox } from '@/lib/inbox';
import type { InboxItem, NotificationKind } from '@/shared/contracts';
import { color, radius, space } from '@/theme/tokens';

type Icon = Parameters<typeof IconSymbol>[0]['name'];
const KIND: Record<NotificationKind, { icon: Icon; tint: string }> = {
  goal: { icon: 'checkmark.circle.fill', tint: color.gold },
  overtake: { icon: 'arrow.up', tint: color.volt },
  reminder: { icon: 'clock.fill', tint: color.text },
  results: { icon: 'trophy.fill', tint: color.gold },
  joins: { icon: 'person.2.fill', tint: color.volt },
  announcement: { icon: 'bell.fill', tint: color.gold },
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen() {
  const { items, unread, loaded, refresh, markRead } = useInbox();
  const [pulling, setPulling] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const open = (n: InboxItem) => {
    haptic.select();
    if (!n.read) markRead([n.id]);
    const href = hrefFor(n);
    if (href) router.push(href as never);
  };

  const fresh = items.filter((i) => !i.read);
  const earlier = items.filter((i) => i.read);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <IconSymbol name="chevron.left" size={22} color={color.text} />
        </Pressable>
        <Row gap={space.lg}>
          {unread > 0 ? (
            <Pressable onPress={() => { haptic.commit(); markRead(); }} hitSlop={10} accessibilityRole="button">
              <T v="caption" style={{ color: color.volt }}>Mark all read</T>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.push('/settings/notifications')} hitSlop={10} accessibilityLabel="Notification settings">
            <IconSymbol name="gearshape.fill" size={20} color={color.muted} />
          </Pressable>
        </Row>
      </Row>

      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxxl, gap: space.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={color.volt}
            onRefresh={async () => {
              setPulling(true);
              await refresh();
              setPulling(false);
            }}
          />
        }
      >
        <T v="title" style={{ marginTop: space.lg }}>Notifications</T>

        {loaded && items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <IconSymbol name="bell.fill" size={26} color={color.faint} />
            </View>
            <T v="heading" style={{ fontSize: 16 }}>All quiet</T>
            <T v="caption" style={{ textAlign: 'center' }}>Overtakes, goals hit, reminders and results land here.</T>
          </View>
        ) : null}

        {[{ title: 'New', list: fresh }, { title: 'Earlier', list: earlier }].map((g) =>
          g.list.length ? (
            <View key={g.title} style={{ gap: space.xs }}>
              <T v="label" style={{ marginBottom: space.xs }}>{g.title}</T>
              {g.list.map((n, i) => (
                <Animated.View key={n.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)} layout={LinearTransition.springify()}>
                  <Pressable onPress={() => open(n)} style={({ pressed }) => [styles.row, !n.read && styles.unread, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                    <View style={[styles.icon, { backgroundColor: `${KIND[n.kind].tint}1A` }]}>
                      <IconSymbol name={KIND[n.kind].icon} size={16} color={KIND[n.kind].tint} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T v="heading" style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>{n.title}</T>
                        <T v="caption" style={{ fontSize: 11 }}>{ago(n.at)}</T>
                      </Row>
                      <T v="caption" numberOfLines={2}>{n.body}</T>
                    </View>
                    {!n.read ? <View style={styles.dot} /> : null}
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ) : null,
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, borderRadius: radius.md },
  unread: { backgroundColor: color.surface },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.volt },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
