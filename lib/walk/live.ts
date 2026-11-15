// The walk as it appears outside the app: a Live Activity (lock screen and Dynamic Island) on iPhone,
// an ongoing notification on Android. Both show the same numbers and take the same commands.
import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { fmtDistanceShort, fmtDuration, fmtKm, fmtPace, fmtSpeed, type TrackStatus } from '@/shared/walk';

export interface LiveSnapshot {
  status: TrackStatus;
  distance: number;
  movingMs: number;
  /** Current speed, m/s. */
  speed: number;
  /** Average pace, seconds per km. */
  pace: number | null;
  steps: number;
  /** Next instruction on a planned route, and metres to it. */
  turn?: string;
  turnKind?: string;
  turnIn?: number;
}

export type LiveCommand = 'pause' | 'resume' | 'finish';

type NativeLive = {
  isSupported(): boolean;
  start(json: string): Promise<void>;
  update(json: string): Promise<void>;
  end(json: string): Promise<void>;
  takeCommand(): string | null;
  prepareVoice(): Promise<void>;
  releaseVoice(): Promise<void>;
  addListener(event: 'onCommand', cb: (e: { command: LiveCommand }) => void): { remove(): void };
};

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<NativeLive>('StepPoolLive') : null;

const CHANNEL = 'walk';
const NOTIFICATION_ID = 'walk-live';
let listener: ((c: LiveCommand) => void) | null = null;
let ready = false;

/** What the iPhone widget draws. A start time lets the timer tick on its own between updates. */
function payload(s: LiveSnapshot, final = false) {
  return JSON.stringify({
    status: final ? 'finished' : s.status,
    distance: fmtKm(s.distance),
    movingMs: Math.round(s.movingMs),
    // "Now minus moving time": the widget counts up from here while recording.
    timerStart: Date.now() - s.movingMs,
    speed: fmtSpeed(s.speed),
    pace: fmtPace(s.pace),
    steps: s.steps,
    turn: s.turn ?? '',
    turnKind: s.turnKind ?? '',
    turnIn: s.turn && s.turnIn != null ? fmtDistanceShort(s.turnIn) : '',
  });
}

async function setupAndroid() {
  if (ready) return;
  ready = true;
  // Low importance: it sits in the shade and on the lock screen without buzzing on every update.
  await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Walk in progress', importance: Notifications.AndroidImportance.LOW, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, showBadge: false, enableVibrate: false, sound: null });
  await Notifications.setNotificationCategoryAsync('walk-recording', [
    { identifier: 'pause', buttonTitle: 'Pause', options: { opensAppToForeground: false } },
    { identifier: 'finish', buttonTitle: 'Finish', options: { opensAppToForeground: true } },
  ]);
  await Notifications.setNotificationCategoryAsync('walk-paused', [
    { identifier: 'resume', buttonTitle: 'Resume', options: { opensAppToForeground: false } },
    { identifier: 'finish', buttonTitle: 'Finish', options: { opensAppToForeground: true } },
  ]);
}

async function postAndroid(s: LiveSnapshot) {
  await setupAndroid();
  const paused = s.status !== 'recording';
  const head = `${fmtKm(s.distance)} km · ${fmtDuration(s.movingMs)}${paused ? (s.status === 'autopaused' ? ' · auto-paused' : ' · paused') : ''}`;
  const stats = `${fmtSpeed(s.speed)} km/h · ${fmtPace(s.pace)} /km${s.steps ? ` · ${s.steps.toLocaleString()} steps` : ''}`;
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: head,
      body: s.turn ? `${s.turnIn != null ? `In ${fmtDistanceShort(s.turnIn)}: ` : ''}${s.turn}\n${stats}` : stats,
      sticky: true,
      autoDismiss: false,
      categoryIdentifier: paused ? 'walk-paused' : 'walk-recording',
      data: { walk: '1' },
    },
    trigger: { channelId: CHANNEL },
  });
}

if (Platform.OS === 'android') {
  Notifications.addNotificationResponseReceivedListener((r) => {
    const id = r.actionIdentifier;
    if (id === 'pause' || id === 'resume' || id === 'finish') listener?.(id);
  });
}
native?.addListener('onCommand', (e) => listener?.(e.command));

export const live = {
  supported: Platform.OS === 'android' || !!native?.isSupported(),
  async start(s: LiveSnapshot) {
    try {
      if (native) await native.start(payload(s));
      else if (Platform.OS === 'android') await postAndroid(s);
    } catch {
      // The walk records fine without its lock-screen display (e.g. Live Activities switched off in Settings).
    }
  },
  async update(s: LiveSnapshot) {
    try {
      if (native) await native.update(payload(s));
      else if (Platform.OS === 'android') await postAndroid(s);
    } catch {
      // see start()
    }
  },
  async end(s?: LiveSnapshot) {
    try {
      if (native) await native.end(s ? payload(s, true) : '');
      else if (Platform.OS === 'android') await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
    } catch {
      // nothing to end
    }
  },
  /** iPhone: lets spoken updates play with the phone locked, lowering (not stopping) any music. */
  async prepareVoice() {
    await native?.prepareVoice().catch(() => {});
  },
  async releaseVoice() {
    await native?.releaseVoice().catch(() => {});
  },
  /** Pause / resume / finish pressed on the lock screen or in the notification. */
  onCommand(cb: (c: LiveCommand) => void) {
    listener = cb;
  },
  /** A command pressed while JS wasn't listening (iPhone button taps arrive through shared storage too). */
  pending(): LiveCommand | null {
    try {
      return (native?.takeCommand() as LiveCommand | null) ?? null;
    } catch {
      return null;
    }
  },
};
