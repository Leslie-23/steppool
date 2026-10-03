import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * Dev-only shortcut: steppool://dev-login?phone=+233240000001 signs in using the OTP the
 * dev server echoes back. Inert in release builds and against a production server.
 */
export default function DevLogin() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { signIn, setHealthGranted } = useSession();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__ || !phone) return;
    (async () => {
      const { devCode } = await api.requestOtp(phone);
      if (!devCode) throw new Error('Server is not in dev mode');
      const { tokens, me } = await api.verifyOtp(phone, devCode);
      await setHealthGranted(true);
      await signIn(tokens, me);
      setDone(true);
    })().catch((e: Error) => setError(e.message));
  }, [phone, signIn, setHealthGranted]);

  if (!__DEV__ || done) return <Redirect href="/" />;
  return (
    <Screen>
      <T v="caption">{error ?? 'Signing in…'}</T>
    </Screen>
  );
}
