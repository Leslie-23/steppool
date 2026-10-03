import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { api } from '@/lib/api';
import { hrefFor, useInbox } from '@/lib/inbox';
import { registerPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { registerBackgroundSync, syncSteps } from '@/lib/sync';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bg, card: color.bg, primary: color.volt, text: color.text, border: color.hairline } };

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const { ready, tokens, me, healthGranted, hydrate, setMe, signOut } = useSession();
  const signedIn = !!tokens;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Load the profile once a session exists so the guards know whether onboarding is finished.
  useEffect(() => {
    if (signedIn && !me) api.me().then(setMe).catch(() => signOut());
  }, [signedIn, me, setMe, signOut]);

  const onboarded = signedIn && !!me?.name && healthGranted;

  useEffect(() => {
    if (!onboarded) return;
    syncSteps().catch(() => {});
    registerBackgroundSync().catch(() => {});
    registerPush().catch(() => {});
    const refreshInbox = useInbox.getState().refresh;
    refreshInbox();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      syncSteps().catch(() => {});
      refreshInbox();
    });
    // A push arriving while open bumps the bell; tapping one (even from a cold start) opens its challenge.
    const received = Notifications.addNotificationReceivedListener(() => refreshInbox());
    const openFromPush = (r: Notifications.NotificationResponse | null) => {
      const d = r?.notification.request.content.data as { challengeId?: string; kind?: string } | undefined;
      const href = d?.challengeId ? hrefFor({ kind: (d.kind ?? 'goal') as never, challengeId: d.challengeId }) : null;
      if (href) router.push(href as never);
    };
    Notifications.getLastNotificationResponseAsync().then(openFromPush).catch(() => {});
    const tapped = Notifications.addNotificationResponseReceivedListener(openFromPush);
    return () => {
      sub.remove();
      received.remove();
      tapped.remove();
    };
  }, [onboarded]);

  const loading = !fontsLoaded || !ready || (signedIn && !me);
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);
  if (loading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <ThemeProvider value={theme}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'fade' }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !onboarded}>
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="challenge/[id]/index" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="challenge/[id]/results" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="challenge/create" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/notifications" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/target" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="code" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="analytics" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="claim/[payoutId]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="join/[code]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack.Protected>
          {__DEV__ ? <Stack.Screen name="dev-login" /> : null}
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
