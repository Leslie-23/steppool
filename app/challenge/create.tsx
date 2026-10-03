import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Segmented } from '@/components/ds/Segmented';
import { Button, Card, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import type { CreateChallengeBody } from '@/shared/contracts';
import { challengeGoal } from '@/shared/goals';
import { color, font, radius, space, type } from '@/theme/tokens';

const DURATIONS = [
  { label: '48 hours', value: 48 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
] as const;
const ENTRIES = [0, 50, 100, 250].map((v) => ({ label: v ? `${v} cr` : 'Free', value: v }));

export default function CreateChallenge() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<CreateChallengeBody['durationHours']>(168);
  const [entry, setEntry] = useState(100);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const goal = challengeGoal(me?.baselineDaily ?? 0, duration);
  const valid = name.trim().length >= 3 && (me?.credits ?? 0) >= entry;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.create({ name: name.trim(), durationHours: duration, entryCredits: entry, visibility });
      haptic.success();
      api.me().then(setMe).catch(() => {});
      router.replace(`/challenge/${c.id}`);
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
            <T v="title">New challenge</T>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={color.muted} />
            </Pressable>
          </Row>

          <View style={{ gap: space.sm }}>
            <T v="label">Name</T>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="RMU IT Walkers"
              placeholderTextColor={color.faint}
              maxLength={48}
              style={styles.input}
              selectionColor={color.volt}
              autoFocus
            />
          </View>

          <View style={{ gap: space.sm }}>
            <T v="label">Duration</T>
            <Segmented options={[...DURATIONS]} value={duration} onChange={setDuration} />
          </View>

          <View style={{ gap: space.sm }}>
            <T v="label">Entry</T>
            <Segmented options={ENTRIES} value={entry} onChange={setEntry} />
            <T v="caption">You have {(me?.credits ?? 0).toLocaleString()} credits. Entries form the pool; everyone who hits their goal splits it.</T>
          </View>

          <View style={{ gap: space.sm }}>
            <T v="label">Who can join</T>
            <Segmented
              options={[
                { label: 'Invite only', value: 'private' as const },
                { label: 'Anyone', value: 'public' as const },
              ]}
              value={visibility}
              onChange={setVisibility}
            />
          </View>

          <Card tone="volt">
            <T v="label">Your goal would be</T>
            <T style={[type.num, { fontSize: 32, marginTop: 4 }]}>{goal.toLocaleString()} steps</T>
            <T v="caption">Everyone gets their own goal from their usual week, so it's fair for every fitness level.</T>
          </Card>
          {error ? <T v="caption" style={{ color: color.danger }}>{error}</T> : null}
        </ScrollView>
        <View style={{ paddingBottom: space.xl }}>
          <Button label={busy ? 'Creating…' : entry ? `Create & enter · ${entry} cr` : 'Create challenge'} onPress={create} disabled={!valid || busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: font.display, fontSize: 24, color: color.text, height: 60, borderRadius: radius.md, backgroundColor: color.surface, paddingHorizontal: space.lg },
});
