import * as BackgroundTask from 'expo-background-task';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { DAY_MS } from '@/shared/contracts';

import { api } from './api';
import { health } from './health';
import { useSession } from './session';

const CURSOR_KEY = 'steppool.sync.cursor';
const TASK = 'steppool-step-sync';
/** Health stores backfill late (watch syncs, phone reboots); always re-read this much overlap. */
const OVERLAP_MS = 3 * 3600_000;
/** First sync pulls a week so the server can compute a baseline. */
const FIRST_WINDOW_MS = 8 * DAY_MS;
const CHUNK = 4000;

let inFlight: Promise<number | null> | null = null;

/** Uploads raw samples since the last cursor. Returns today's verified steps from the server, or null. */
export function syncSteps(): Promise<number | null> {
  inFlight ??= run().finally(() => (inFlight = null));
  return inFlight;
}

async function run(): Promise<number | null> {
  const { tokens, healthGranted } = useSession.getState();
  if (!tokens || !healthGranted || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;

  const now = new Date();
  const saved = await SecureStore.getItemAsync(CURSOR_KEY);
  const from = saved ? new Date(Math.max(0, Number(saved) - OVERLAP_MS)) : new Date(now.getTime() - FIRST_WINDOW_MS);

  const samples = await health.getStepSamples(from, now);
  let todaySteps: number | null = null;
  for (let i = 0; i < samples.length || i === 0; i += CHUNK) {
    const res = await api.ingest({ platform: Platform.OS, samples: samples.slice(i, i + CHUNK) });
    todaySteps = res.todaySteps;
  }
  await SecureStore.setItemAsync(CURSOR_KEY, String(now.getTime()));
  return todaySteps;
}

TaskManager.defineTask(TASK, async () => {
  try {
    await useSession.getState().hydrate();
    await syncSteps();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync() {
  if (Platform.OS === 'web') return;
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 30 });
  }
}
