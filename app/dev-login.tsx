import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * Dev-only shortcut: steppool://dev-login?email=leslie@example.com signs in using the OTP the
 * dev server echoes back. Inert in release builds and against a production server.
 */
export default function DevLogin() {
  const { email, out } = useLocalSearchParams<{ email?: string; out?: string }>();
  const { signIn, setHealthGranted, signOut } = useSession();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__ && out) {
      signOut().then(() => setDone(true));
      return;
    }
    const clean = email?.trim().toLowerCase();
    if (!__DEV__ || !clean) return;
    (async () => {
      const { devCode } = await api.requestOtp(clean);
      if (!devCode) throw new Error('Server is not in dev mode');
      const { tokens, me } = await api.verifyOtp(clean, devCode);
      await setHealthGranted(true);
      await signIn(tokens, me);
      setDone(true);
    })().catch((e: Error) => setError(e.message));
  }, [email, out, signIn, setHealthGranted, signOut]);

  if (!__DEV__ || done) return <Redirect href="/" />;
  return (
    <Screen>
      <T v="caption">{error ?? 'Signing in…'}</T>
    </Screen>
  );
}
