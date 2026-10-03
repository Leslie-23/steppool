import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { color, space } from '@/theme/tokens';

/** Resolves an invite code to a challenge, then hands off to the Arena (which owns the join button). */
export default function JoinByCode() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .byCode(code)
      .then((c) => setId(c.id))
      .catch(() => setError("That invite link doesn't match a challenge."));
  }, [code]);

  if (id) return <Redirect href={`/challenge/${id}`} />;
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg }}>
        <T v="label" style={{ color: color.volt }}>Invite {code}</T>
        <T v="heading">{error ?? 'Finding your challenge…'}</T>
        {error ? <Button label="Browse challenges" tone="ghost" onPress={() => router.replace('/(tabs)/challenges')} /> : null}
      </View>
    </Screen>
  );
}
