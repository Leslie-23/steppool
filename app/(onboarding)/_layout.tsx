import { Stack } from 'expo-router';

import { useSession } from '@/lib/session';
import { color } from '@/theme/tokens';

export default function OnboardingLayout() {
  const hasName = useSession((s) => !!s.me?.name);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!hasName}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Screen name="health" />
    </Stack>
  );
}
