import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { CashRules } from '@/components/cash/CashRules';
import { Coin } from '@/components/ds/Coin';
import { GoalSlider } from '@/components/ds/GoalSlider';
import { Odometer } from '@/components/ds/Odometer';
import { Segmented } from '@/components/ds/Segmented';
import { Button, Card, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { payAndJoin } from '@/lib/pay';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import type { CreateChallengeBody } from '@/shared/contracts';
import { CASH, ghs } from '@/shared/cash';
import { challengeGoal, dailyTarget, DEFAULT_MULTIPLIER, intensityLabel, MAX_DAILY, MAX_MULTIPLIER, MIN_DAILY, MIN_MULTIPLIER, stretchText } from '@/shared/goals';
import { color, font, radius, space } from '@/theme/tokens';

const DURATIONS = [
  { label: '48 hours', value: 48 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
] as const;
const CASH_ENTRIES = CASH.entryOptions.map((v) => ({ label: ghs(v), value: v }));
const ENTRIES = [0, 50, 100, 250].map((v) => ({ label: v ? String(v) : 'Free', value: v, icon: v ? <Coin tone="silver" size={16} /> : undefined }));

export default function CreateChallenge() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<CreateChallengeBody['durationHours']>(168);
  const [entry, setEntry] = useState(100);
  const [mode, setMode] = useState<'credits' | 'cash'>('credits');
  const [cashEntry, setCashEntry] = useState<(typeof CASH.entryOptions)[number]>(2000);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState(DEFAULT_MULTIPLIER);
  const goal = challengeGoal(me?.baselineDaily ?? 0, duration, multiplier);
  const perDay = Math.round(goal / (duration / 24));
  // Daily goals are clamped for safety; say so instead of letting the slider silently do nothing.
  const daily = dailyTarget(me?.baselineDaily ?? 0, multiplier);
  const clamp = daily >= MAX_DAILY ? 'max' : daily <= MIN_DAILY ? 'min' : null;
  const isCash = mode === 'cash' && !!me?.cashEnabled;
  const valid = name.trim().length >= 3 && (isCash || (me?.credits ?? 0) >= entry);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isCash) {
        const base = { name: name.trim(), durationHours: duration, visibility, goalMultiplier: multiplier };
        const created = await api.createCash({ ...base, entryPesewas: cashEntry });
        // The creator pays in like everyone else; if they back out of checkout the challenge still exists, unjoined.
        await payAndJoin(created.id).catch((e) => setError((e as Error).message));
        haptic.success();
        api.me().then(setMe).catch(() => {});
        router.replace(`/challenge/${created.id}`);
        return;
      }
      const c = await api.create({ name: name.trim(), durationHours: duration, entryCredits: entry, visibility, goalMultiplier: multiplier });
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

          {me?.cashEnabled ? (
            <View style={{ gap: space.sm }}>
              <T v="label">Play for</T>
              <Segmented
                options={[
                  { label: 'Credits', value: 'credits' as const, icon: <Coin tone="silver" size={16} /> },
                  { label: 'Cash', value: 'cash' as const },
                ]}
                value={mode}
                onChange={setMode}
              />
            </View>
          ) : null}

          {isCash ? (
            <View style={{ gap: space.sm }}>
              <T v="label">Entry</T>
              <Segmented options={CASH_ENTRIES} value={cashEntry} onChange={setCashEntry} />
              <CashRules entry={cashEntry} players={10} />
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <T v="label">Entry</T>
              <Segmented options={ENTRIES} value={entry} onChange={setEntry} />
              <T v="caption">You have {(me?.credits ?? 0).toLocaleString()} credits. Entries form the pool; everyone who hits their goal splits it.</T>
            </View>
          )}

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

          <Card tone="volt" style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="label">Goal difficulty</T>
              <Row gap={6}>
                <T v="caption" style={{ color: color.volt }}>{intensityLabel(multiplier)}</T>
                <T v="caption">· usual pace {stretchText(multiplier)}</T>
              </Row>
            </Row>
            <Row gap={6} style={{ alignItems: 'flex-end' }}>
              <Odometer value={goal} size={36} />
              <T v="caption" style={{ marginBottom: 6 }}>steps for you · ~{perDay.toLocaleString()}/day</T>
            </Row>
            {clamp ? (
              <Row gap={6}>
                <IconSymbol name="lock.fill" size={12} color={color.muted} />
                <T v="caption" style={{ fontSize: 12 }}>
                  {clamp === 'max' ? `Capped at ${MAX_DAILY.toLocaleString()} steps/day for safety` : `Floor of ${MIN_DAILY.toLocaleString()} steps/day`} — going further won't change your goal.
                </T>
              </Row>
            ) : null}
            <GoalSlider value={multiplier} onChange={setMultiplier} min={MIN_MULTIPLIER} max={MAX_MULTIPLIER} step={0.05} recommended={DEFAULT_MULTIPLIER} />
            <T v="caption">Applies to everyone's own usual pace, so it stays fair across fitness levels. Each player sees their own number.</T>
          </Card>
          {error ? <T v="caption" style={{ color: color.danger }}>{error}</T> : null}
        </ScrollView>
        <View style={{ paddingBottom: space.xl }}>
          <Button
            label={busy ? 'Creating…' : isCash ? `Create & pay · ${ghs(cashEntry)}` : entry ? `Create & enter · ${entry} credits` : 'Create challenge'}
            tone={isCash ? 'gold' : 'volt'}
            onPress={create}
            disabled={!valid || busy}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: font.display, fontSize: 24, color: color.text, height: 60, borderRadius: radius.md, backgroundColor: color.surface, paddingHorizontal: space.lg },
});
