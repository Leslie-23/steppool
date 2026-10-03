import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CodeCells, type CodeCellsHandle } from '@/components/ds/CodeCells';
import { Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { space } from '@/theme/tokens';

const LEN = 6;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const cells = useRef<CodeCellsHandle>(null);
  const signIn = useSession((s) => s.signIn);

  useEffect(() => {
    if (code.length !== LEN || busy) return;
    setBusy(true);
    api
      .verifyOtp(email, code)
      .then(async ({ tokens, me }) => {
        haptic.success();
        await signIn(tokens, me);
      })
      .catch(() => {
        cells.current?.shake();
        setCode('');
      })
      .finally(() => setBusy(false));
  }, [code, busy, email, signIn]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xxl }}>
        <View style={{ gap: space.sm }}>
          <T v="title">Enter the code</T>
          <T v="caption">Sent to {email}. Check spam if it isn't there in a minute.</T>
        </View>
        <CodeCells
          ref={cells}
          value={code}
          onChange={setCode}
          length={LEN}
          sanitize={(t) => t.replace(/\D/g, '')}
          inputProps={{ keyboardType: 'number-pad', textContentType: 'oneTimeCode', autoComplete: 'one-time-code' }}
        />
        <Pressable onPress={() => router.back()}>
          <T v="caption" style={{ textAlign: 'center' }}>Wrong email? Go back</T>
        </Pressable>
      </View>
    </Screen>
  );
}
