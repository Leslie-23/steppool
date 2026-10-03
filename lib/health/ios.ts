import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import type { RecordingMethod, StepSample } from '@/shared/contracts';

import type { HealthSource } from './types';

const STEPS = 'HKQuantityTypeIdentifierStepCount' as const;

function kindOf(model?: string): NonNullable<StepSample['device']>['kind'] {
  if (!model) return undefined;
  if (/watch/i.test(model)) return 'watch';
  if (/iphone/i.test(model)) return 'phone';
  return 'other';
}

export const iosHealth: HealthSource = {
  async availability() {
    return (await isHealthDataAvailableAsync()) ? 'available' : 'unavailable';
  },
  async requestAuth() {
    // HealthKit never reveals whether read access was denied, so success here only means the sheet was shown.
    return requestAuthorization({ toRead: [STEPS] });
  },
  async getStepSamples(from, to) {
    const samples = await queryQuantitySamples(STEPS, {
      limit: 0,
      ascending: true,
      filter: { date: { startDate: from, endDate: to } },
    });
    return samples.map((s): StepSample => {
      const userEntered = (s.metadata as Record<string, unknown> | undefined)?.HKWasUserEntered === true;
      const method: RecordingMethod = userEntered ? 'manual' : 'automatic';
      return {
        start: s.startDate.toISOString(),
        end: s.endDate.toISOString(),
        count: Math.round(s.quantity),
        source: s.sourceRevision.source.bundleIdentifier,
        nativeId: s.uuid,
        recordingMethod: method,
        device: { model: s.device?.model ?? s.sourceRevision.productType, kind: kindOf(s.device?.model ?? s.sourceRevision.productType) },
      };
    });
  },
};
