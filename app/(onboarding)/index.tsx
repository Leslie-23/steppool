import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Avatar, Button, Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { color, font, radius, space } from '@/theme/tokens';

export default function NameScreen() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const setMe = useSession((s) => s.setMe);
  const valid = name.trim().length >= 2;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      setMe(await api.updateMe({ name: name.trim() }));
      haptic.commit();
    } catch {
      haptic.error();
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.xl }}>
          <Animated.View entering={ZoomIn.springify()} key={name.trim().slice(0, 2)}>
            <Avatar name={name.trim() || '?'} size={96} ring={valid ? color.volt : color.hairline} />
          </Animated.View>
          <Animated.View entering={FadeIn.delay(100)} style={{ alignItems: 'center', gap: space.sm }}>
            <T v="title">What should we call you?</T>
            <T v="caption">This is how you show up on leaderboards.</T>
          </Animated.View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={color.faint}
            autoFocus
            maxLength={24}
            autoCapitalize="words"
            style={styles.input}
            selectionColor={color.volt}
            onSubmitEditing={save}
          />
        </View>
        <View style={{ paddingBottom: space.xl }}>
          <Button label={busy ? 'Saving…' : 'Continue'} onPress={save} disabled={!valid || busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontFamily: font.display,
    fontSize: 28,
    color: color.text,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
});
