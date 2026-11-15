import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Row, Screen, T } from '@/components/ds/primitives';
import { BackBar } from '@/components/walk/bits';
import { haptic } from '@/lib/haptics';
import { useWalks } from '@/lib/walk/store';
import type { WalkPrefs } from '@/lib/walk/types';
import { color, space } from '@/theme/tokens';

const ROWS: { key: keyof WalkPrefs; title: string; body: string }[] = [
  { key: 'voice', title: 'Spoken updates', body: 'Your time at each kilometre, and turns when you follow a route' },
  { key: 'kmAlerts', title: 'Kilometre alerts', body: 'A notification each kilometre with its time' },
  { key: 'records', title: 'Records', body: 'Fastest kilometre and longest walk' },
  { key: 'autoPause', title: 'Auto-pause', body: 'Stop the clock when you stand still, and start it again when you move' },
];

export default function WalkSettings() {
  const { prefs, setPrefs, load } = useWalks();
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Screen>
      <BackBar onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxxl }} showsVerticalScrollIndicator={false}>
        <T v="title" style={{ marginTop: space.lg }}>Walk recording</T>
        <View style={{ gap: space.xs }}>
          {ROWS.map((r) => (
            <Row key={r.key} gap={space.md} style={styles.row}>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontSize: 15 }}>{r.title}</T>
                <T v="caption">{r.body}</T>
              </View>
              <Switch
                value={prefs[r.key]}
                onValueChange={(v) => {
                  haptic.select();
                  setPrefs({ [r.key]: v });
                }}
                trackColor={{ true: color.volt, false: color.raised }}
                thumbColor={color.text}
                ios_backgroundColor={color.raised}
                accessibilityLabel={r.title}
              />
            </Row>
          ))}
          <T v="caption" style={{ fontSize: 11, marginTop: space.sm }}>Changes apply from your next walk. Your routes are stored on this phone only.</T>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
});
