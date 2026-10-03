import {
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

import type { RecordingMethod, StepSample } from '@/shared/contracts';

import type { HealthSource } from './types';

// Mirrors Health Connect's RecordingMethod / DeviceType enums.
const METHOD: Record<number, RecordingMethod> = { 0: 'unknown', 1: 'active', 2: 'automatic', 3: 'manual' };
const DEVICE: Record<number, NonNullable<StepSample['device']>['kind']> = { 2: 'phone', 6: 'band' };

let initialized = false;
async function ensureInit() {
  if (!initialized) initialized = await initialize();
  return initialized;
}

export const androidHealth: HealthSource = {
  async availability() {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs-install';
    return 'unavailable';
  },
  async requestAuth() {
    if (!(await ensureInit())) return false;
    const granted = await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
    return granted.some((p) => 'recordType' in p && p.recordType === 'Steps');
  },
  async getStepSamples(from, to) {
    await ensureInit();
    const out: StepSample[] = [];
    let pageToken: string | undefined;
    do {
      const page = await readRecords('Steps', {
        timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() },
        pageSize: 1000,
        pageToken,
      });
      for (const r of page.records) {
        const md = r.metadata;
        out.push({
          start: new Date(r.startTime).toISOString(),
          end: new Date(r.endTime).toISOString(),
          count: r.count,
          source: md?.dataOrigin ?? 'unknown',
          nativeId: md?.id ?? `${md?.dataOrigin}:${r.startTime}:${r.endTime}`,
          recordingMethod: METHOD[md?.recordingMethod ?? 0] ?? 'unknown',
          device: md?.device ? { model: md.device.model, kind: DEVICE[md.device.type ?? 0] ?? 'other' } : undefined,
        });
      }
      pageToken = page.pageToken || undefined;
    } while (pageToken);
    return out;
  },
  openSettings: () => openHealthConnectSettings(),
};
