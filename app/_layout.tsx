import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { Intro } from '@/components/Intro';
import { api, ApiError } from '@/lib/api';
import { hrefFor, useInbox } from '@/lib/inbox';
// Imported here so the background location task is registered as soon as the app (or a headless launch) loads.
import { recorder, useRecorder } from '@/lib/walk/recorder';
import { registerPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { registerBackgroundSync, syncSteps } from '@/lib/sync';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const INTRO_KEY = 'steppool.introSeen';

function devConfig(): { login?: string; route?: string; noPush?: boolean } {
  try {
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system'); // eslint-disable-line @typescript-eslint/no-require-imports
    const f = new File(Paths.document, 'dev.json');
    return f.exists ? JSON.parse(f.textSync()) : {};
  } catch {
    return {};
  }
}

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bg, card: color.bg, primary: color.volt, text: color.text, border: color.hairline } };

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const { ready, tokens, me, healthGranted, hydrate, setMe, signOut } = useSession();
  const signedIn = !!tokens;
  // First launch only: the brand intro plays once for people who have never signed in on this device.
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync(INTRO_KEY).then((v) => setIntroSeen(v === '1')).catch(() => setIntroSeen(true));
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Refresh the profile whenever a session exists. Only a 401 (session truly rejected) signs out;
  // network errors and a sleeping server keep the cached profile and retry.
  useEffect(() => {
    if (!signedIn) return;
    let stopped = false;
    let attempt = 0;
    const load = () =>
      api
        .me()
        .then((m) => !stopped && setMe(m))
        .catch((e) => {
          if (stopped) return;
          if (e instanceof ApiError && e.status === 401) signOut();
          else setTimeout(load, Math.min(30_000, 2000 * 2 ** attempt++));
        });
    load();
    return () => {
      stopped = true;
    };
  }, [signedIn, setMe, signOut]);

  const onboarded = signedIn && !!me?.name && healthGranted;

  useEffect(() => {
    if (!onboarded) return;
    syncSteps().catch(() => {});
    registerBackgroundSync().catch(() => {});
    // Asked once, right after onboarding; iOS shows the system prompt only the first time, so later launches just refresh the token.
    if (!(__DEV__ && devConfig().noPush)) registerPush({ prompt: true }).catch(() => {});
    const refreshInbox = useInbox.getState().refresh;
    refreshInbox();
    // A walk still recording from before the app was closed picks up where it was.
    recorder.hydrate().catch(() => {});
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      syncSteps().catch(() => {});
      refreshInbox();
    });
    // A push arriving while open bumps the bell; tapping one (even from a cold start) opens its challenge.
    const received = Notifications.addNotificationReceivedListener(() => refreshInbox());
    const openFromPush = (r: Notifications.NotificationResponse | null) => {
      const d = r?.notification.request.content.data as { challengeId?: string; kind?: string; screen?: string; walk?: string } | undefined;
      // The walk's own notifications (live numbers, kilometre alerts) open the recorder; its buttons are handled there.
      if (d?.walk) {
        if (r?.actionIdentifier === 'pause' || r?.actionIdentifier === 'resume') return;
        return router.push((useRecorder.getState().status === 'idle' ? '/walk/history' : '/walk') as never);
      }
      const href = d ? hrefFor({ kind: (d.kind ?? 'goal') as never, challengeId: d.challengeId, screen: d.screen }) : null;
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

  const loading = !fontsLoaded || !ready || introSeen === null || (signedIn && !me);

  // Dev builds only: a `dev.json` dropped into the app's Documents folder ({"login": "email,code", "route": "/walk/history"})
  // signs in and opens a screen directly, so screens can be checked on a simulator without tapping through.
  useEffect(() => {
    if (!__DEV__ || loading) return;
    const dev = devConfig();
    if (!signedIn && dev.login) {
      const [email, code] = dev.login.split(',');
      // Wait for the navigator to mount; a push before that is dropped.
      const id = setTimeout(() => router.push(`/dev-login?email=${encodeURIComponent(email)}${code ? `&code=${code}` : ''}` as never), 1200);
      return () => clearTimeout(id);
    } else if (onboarded && dev.route) {
      const id = setTimeout(() => router.push(dev.route as never), 800);
      return () => clearTimeout(id);
    }
  }, [loading, signedIn, onboarded]);

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
            <Stack.Screen name="settings/delete-account" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="code" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="analytics" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="walk/index" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="walk/plan" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="walk/history" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="walk/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="walk/replay/[id]" options={{ animation: 'fade' }} />
            <Stack.Screen name="walk/compare" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/walk" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="claim/[payoutId]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="join/[code]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="withdraw" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="paid" options={{ presentation: 'transparentModal', animation: 'none' }} />
          </Stack.Protected>
          {__DEV__ ? <Stack.Screen name="dev-login" /> : null}
        </Stack>
        {!signedIn && introSeen === false ? (
          <Intro
            onDone={() => {
              setIntroSeen(true);
              SecureStore.setItemAsync(INTRO_KEY, '1').catch(() => {});
            }}
          />
        ) : null}
        <StatusBar style={!signedIn && introSeen === false ? 'dark' : 'light'} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
