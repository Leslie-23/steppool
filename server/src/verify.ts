// Step verification. Pure functions only, so every rule is unit-testable.
//
// The pipeline: classify each raw sample → split into UTC hours → per hour, take the MAX across
// trusted sources (phone + watch both see the same walk; summing would double count) → apply
// day-level pattern checks that move suspicious hours from `counted` to `held`.

import type { RecordingMethod } from '../../shared/contracts.js';

export const HOUR_MS = 3_600_000;
/** Elite race cadence tops out near 200 steps/min; anything sustained above this is not walking. */
export const MAX_CADENCE = 250;
/** 150 steps/min for a full hour, four hours in a row: the signature of a phone shaker or fan. */
export const SUSTAINED_HOURLY = 9000;
export const SUSTAINED_RUN_HOURS = 4;
/** Uploads of old data above this size are held for review rather than counted live. */
export const LATE_AFTER_MS = 24 * HOUR_MS;
/** A late day is only suspicious above this, or twice the person's usual day, whichever is higher. */
export const LATE_DAILY_FLOOR = 20_000;

const TRUSTED_PREFIXES = [
  'com.apple.health', // iPhone and Apple Watch motion coprocessors
];
const TRUSTED_IDS = new Set([
  'android', // Health Connect's own on-device step tracking (Android 14+)
  'com.google.android.apps.fitness',
  'com.google.android.apps.healthdata',
  'com.sec.android.app.shealth',
  'com.fitbit.FitbitMobile',
  'com.garmin.android.apps.connectmobile',
  'com.garmin.connect.mobile',
  'com.mi.health',
  'com.xiaomi.wearable',
  'com.huawei.health',
  'com.heytap.health',
  'com.oplus.health',
]);

export function isTrustedSource(source: string, extra: string[] = []) {
  return TRUSTED_IDS.has(source) || extra.includes(source) || TRUSTED_PREFIXES.some((p) => source.startsWith(p));
}

export interface RawSample {
  start: Date;
  end: Date;
  count: number;
  source: string;
  recordingMethod?: RecordingMethod | string | null;
  rejected?: string | null;
  held?: string | null;
}

export type Rejection = 'manual' | 'untrusted_source' | 'cadence' | 'bad_interval' | 'future';

export function classify(s: RawSample, now: Date, extraTrusted: string[] = []): Rejection | null {
  const ms = s.end.getTime() - s.start.getTime();
  if (ms < 0) return 'bad_interval';
  if (s.end.getTime() > now.getTime() + 5 * 60_000) return 'future';
  if (s.recordingMethod === 'manual') return 'manual';
  if (!isTrustedSource(s.source, extraTrusted)) return 'untrusted_source';
  // Instant samples (start == end) can't be cadence-checked on their own; treat as one minute.
  const minutes = Math.max(ms / 60_000, 1);
  if (s.count / minutes > MAX_CADENCE) return 'cadence';
  return null;
}

/**
 * Holds an upload's old samples (>24h) for review when they describe days far busier than this
 * person's normal. Honest late syncs (background sync killed by the OS for two days) pass:
 * what matters is whether the late days look like the same person, not that they arrived late.
 */
export function holdLateBackfill<T extends RawSample>(samples: T[], uploadedAt: Date, baselineDaily = 0): T[] {
  const late = samples.filter((s) => !s.rejected && uploadedAt.getTime() - s.end.getTime() > LATE_AFTER_MS);
  if (!late.length) return samples;
  // Per day, take the busiest source (phone and watch describe the same walking).
  const perDay = new Map<number, Map<string, number>>();
  for (const s of late) {
    const day = Math.floor(s.start.getTime() / (24 * HOUR_MS));
    const bySource = perDay.get(day) ?? new Map<string, number>();
    bySource.set(s.source, (bySource.get(s.source) ?? 0) + s.count);
    perDay.set(day, bySource);
  }
  const dayTotals = [...perDay.values()].map((m) => Math.max(...m.values()));
  const avg = dayTotals.reduce((a, b) => a + b, 0) / dayTotals.length;
  if (avg <= Math.max(LATE_DAILY_FLOOR, 2 * baselineDaily)) return samples;
  const lateSet = new Set(late);
  return samples.map((s) => (lateSet.has(s) ? { ...s, held: 'late_backfill' } : s));
}

export const floorHour = (d: Date) => new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS);

/** Splits a sample across the UTC hours it spans, proportionally to time. */
export function splitIntoHours(s: Pick<RawSample, 'start' | 'end' | 'count'>): { hour: number; count: number }[] {
  const a = s.start.getTime();
  const b = s.end.getTime();
  if (b <= a) return [{ hour: floorHour(s.start).getTime(), count: s.count }];
  const out: { hour: number; count: number }[] = [];
  for (let h = Math.floor(a / HOUR_MS) * HOUR_MS; h < b; h += HOUR_MS) {
    const overlap = Math.min(b, h + HOUR_MS) - Math.max(a, h);
    if (overlap > 0) out.push({ hour: h, count: (s.count * overlap) / (b - a) });
  }
  return out;
}

export interface Bucket {
  hour: number;
  counted: number;
  held: number;
  flags: string[];
  bySource: Record<string, number>;
}

/** Builds hourly buckets for the given hours from every sample overlapping them. */
export function buildBuckets(samples: RawSample[], hours: Iterable<number>): Map<number, Bucket> {
  const wanted = new Set(hours);
  const clean = new Map<number, Record<string, number>>();
  const all = new Map<number, Record<string, number>>();
  for (const h of wanted) {
    clean.set(h, {});
    all.set(h, {});
  }
  for (const s of samples) {
    if (s.rejected) continue;
    for (const part of splitIntoHours(s)) {
      if (!wanted.has(part.hour)) continue;
      const allH = all.get(part.hour)!;
      allH[s.source] = (allH[s.source] ?? 0) + part.count;
      if (!s.held) {
        const cleanH = clean.get(part.hour)!;
        cleanH[s.source] = (cleanH[s.source] ?? 0) + part.count;
      }
    }
  }
  const out = new Map<number, Bucket>();
  for (const h of wanted) {
    const c = clean.get(h)!;
    const a = all.get(h)!;
    const counted = Math.round(Math.max(0, ...Object.values(c)));
    const total = Math.round(Math.max(0, ...Object.values(a)));
    const flags = total > counted ? ['late_backfill'] : [];
    const bySource = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Math.round(v)]));
    out.set(h, { hour: h, counted, held: total - counted, flags, bySource });
  }
  return out;
}

/**
 * Day-level pattern check over a contiguous run of hourly buckets (sorted by hour).
 * Runs of ≥4 consecutive hours at shaker-level volume are moved to `held`.
 */
export function applySustainedCheck(buckets: Bucket[]): Bucket[] {
  const sorted = [...buckets].sort((x, y) => x.hour - y.hour);
  const out = sorted.map((b) => ({ ...b, flags: [...b.flags] }));
  let runStart = -1;
  const flush = (endExclusive: number) => {
    if (runStart >= 0 && endExclusive - runStart >= SUSTAINED_RUN_HOURS) {
      for (let i = runStart; i < endExclusive; i++) {
        out[i].held += out[i].counted;
        out[i].counted = 0;
        if (!out[i].flags.includes('sustained_cadence')) out[i].flags.push('sustained_cadence');
      }
    }
    runStart = -1;
  };
  for (let i = 0; i < out.length; i++) {
    const contiguous = i > 0 && out[i].hour - out[i - 1].hour === HOUR_MS;
    if (out[i].counted >= SUSTAINED_HOURLY) {
      if (runStart < 0 || !contiguous) {
        flush(i);
        runStart = i;
      }
    } else {
      flush(i);
    }
  }
  flush(out.length);
  return out;
}
