import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { toE164 } from '@/lib/phone';
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
    // URL decoding can turn the leading "+" into a space; normalise like the sign-in screen does.
    const e164 = phone ? toE164(phone) : null;
    if (!__DEV__ || !e164) return;
    (async () => {
      const { devCode } = await api.requestOtp(e164);
      if (!devCode) throw new Error('Server is not in dev mode');
      const { tokens, me } = await api.verifyOtp(e164, devCode);
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
