import { Platform } from 'react-native';

import type { HealthSource } from './types';

export type { HealthAvailability, HealthSource } from './types';

/** Web / unsupported: a no-op source so screens still render. */
const none: HealthSource = {
  availability: async () => 'unavailable',
  requestAuth: async () => false,
  getStepSamples: async () => [],
};

// Lazy requires keep each platform's native module out of the other platform's bundle path.
export const health: HealthSource =
  Platform.OS === 'ios'
    ? (require('./ios') as typeof import('./ios')).iosHealth
    : Platform.OS === 'android'
      ? (require('./android') as typeof import('./android')).androidHealth
      : none;
