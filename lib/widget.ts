import { Platform } from 'react-native';

const GROUP = 'group.com.steppool.app';

type Snapshot = { steps: number; target: number; challenge?: string; rank?: number; gapToNext?: number; nextName?: string };

let last = '';

/** Mirrors today's numbers into the App Group the iOS widget reads, then reloads it. */
export function updateWidget(s: Snapshot) {
  if (Platform.OS !== 'ios') return;
  const key = JSON.stringify(s);
  if (key === last) return;
  last = key;
  try {
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    const storage = new ExtensionStorage(GROUP);
    storage.set('steps', s.steps);
    storage.set('target', s.target);
    storage.set('challenge', s.challenge);
    storage.set('rank', s.rank ?? 0);
    storage.set('gapToNext', s.gapToNext ?? 0);
    storage.set('nextName', s.nextName);
    ExtensionStorage.reloadWidget('StepWidget');
  } catch {
    // Native module missing (Expo Go / web): the widget just won't update.
  }
}
