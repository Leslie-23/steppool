import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { color, space } from '@/theme/tokens';

type Toast = { id: number; text: string; tone: 'volt' | 'gold' | 'muted'; icon: Parameters<typeof IconSymbol>[0]['name'] };

/** Glass toasts that drop from the top for live events (overtakes, goals hit). */
export function useToasts() {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setItems((cur) => [...cur.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), 3200);
  }, []);
  return { items, push };
}

export function ToastStack({ items }: { items: Toast[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.stack, { top: insets.top + space.sm }]} pointerEvents="none">
      {items.map((t) => (
        <Animated.View key={t.id} entering={SlideInUp.springify().damping(16)} exiting={FadeOutUp}>
          <Card glass tone={t.tone === 'muted' ? undefined : t.tone} style={{ paddingVertical: space.md }}>
            <Row gap={space.sm}>
              <IconSymbol name={t.icon} size={16} color={t.tone === 'gold' ? color.gold : t.tone === 'volt' ? color.volt : color.muted} />
              <T v="body" style={{ fontSize: 14 }}>{t.text}</T>
            </Row>
          </Card>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ stack: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm, zIndex: 10 } });
