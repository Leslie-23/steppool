import { describe, expect, it } from 'vitest';

import { baselineFrom, challengeGoal, dailyTarget } from '../../shared/goals.js';
import { splitPool, splitPrize } from '../src/settle.js';
import { HOUR_MS, applySustainedCheck, buildBuckets, classify, holdLateBackfill, splitIntoHours, type RawSample } from '../src/verify.js';

const T0 = Date.UTC(2026, 9, 5, 8); // 08:00 UTC
const at = (h: number, m = 0) => new Date(T0 + h * HOUR_MS + m * 60_000);
const iphone = 'com.apple.health.81A1B2C3';
const watch = 'com.apple.health.WATCH999';
const sample = (o: Partial<RawSample> & { start: Date; end: Date; count: number }): RawSample => ({ source: iphone, recordingMethod: 'automatic', ...o });

describe('classify', () => {
  const now = at(24);
  it('accepts ordinary walking from a trusted source', () => {
    expect(classify(sample({ start: at(0), end: at(0, 10), count: 1100 }), now)).toBeNull();
  });
  it('rejects manual entries, untrusted apps, impossible cadence and future data', () => {
    expect(classify(sample({ start: at(0), end: at(0, 10), count: 1000, recordingMethod: 'manual' }), now)).toBe('manual');
    expect(classify(sample({ start: at(0), end: at(0, 10), count: 1000, source: 'com.stepfaker.pro' }), now)).toBe('untrusted_source');
    expect(classify(sample({ start: at(0), end: at(0, 10), count: 4000 }), now)).toBe('cadence');
    expect(classify(sample({ start: at(30), end: at(31), count: 100 }), now)).toBe('future');
  });
  it('honours extra trusted sources from config', () => {
    expect(classify(sample({ start: at(0), end: at(0, 10), count: 900, source: 'com.transsion.health' }), now, ['com.transsion.health'])).toBeNull();
  });
});

describe('buckets', () => {
  it('splits samples across hours proportionally', () => {
    const parts = splitIntoHours({ start: at(0, 30), end: at(1, 30), count: 1000 });
    expect(parts.map((p) => Math.round(p.count))).toEqual([500, 500]);
  });

  it('takes the max across sources so phone + watch are not double counted', () => {
    const b = buildBuckets(
      [sample({ start: at(0), end: at(0, 30), count: 3000 }), sample({ start: at(0), end: at(0, 30), count: 3200, source: watch })],
      [at(0).getTime()],
    ).get(at(0).getTime())!;
    expect(b.counted).toBe(3200);
    expect(b.bySource).toEqual({ [iphone]: 3000, [watch]: 3200 });
  });

  it('ignores rejected samples and holds held ones', () => {
    const b = buildBuckets(
      [sample({ start: at(0), end: at(0, 20), count: 2000 }), sample({ start: at(0, 20), end: at(0, 40), count: 1500, held: 'late_backfill' }), sample({ start: at(0), end: at(0, 5), count: 9999, rejected: 'manual' })],
      [at(0).getTime()],
    ).get(at(0).getTime())!;
    expect(b.counted).toBe(2000);
    expect(b.held).toBe(1500);
  });

  it('moves 4+ consecutive shaker-level hours to held', () => {
    const hours = [0, 1, 2, 3, 4, 5].map((h) => at(h).getTime());
    const samples = [1, 2, 3, 4].map((h) => sample({ start: at(h), end: at(h + 1), count: 9600 }));
    samples.push(sample({ start: at(0), end: at(1), count: 4000 }));
    const out = applySustainedCheck([...buildBuckets(samples, hours).values()]);
    expect(out.map((b) => b.counted)).toEqual([4000, 0, 0, 0, 0, 0]);
    expect(out.slice(1, 5).every((b) => b.held === 9600 && b.flags.includes('sustained_cadence'))).toBe(true);
  });

  it('leaves a genuine 3-hour hike alone', () => {
    const hours = [0, 1, 2].map((h) => at(h).getTime());
    const out = applySustainedCheck([...buildBuckets([0, 1, 2].map((h) => sample({ start: at(h), end: at(h + 1), count: 9500 })), hours).values()]);
    expect(out.every((b) => b.counted === 9500)).toBe(true);
  });
});

describe('late backfill', () => {
  const now = at(96);
  const days = (perHour: number, hours: number[], source = iphone) => hours.map((h) => sample({ start: at(h), end: at(h + 1), count: perHour, source }));
  it('holds days of old data far above anything this person normally walks', () => {
    const dump = days(9000, [0, 1, 2, 3, 24, 25, 26, 27]); // 36k/day, uploaded days later
    expect(holdLateBackfill(dump, now, 6000).every((s) => s.held === 'late_backfill')).toBe(true);
  });
  it('lets an honest late sync through (background sync died for two days)', () => {
    const normal = days(1000, [0, 2, 4, 6, 8, 24, 26, 28, 30, 32]); // 5k/day
    expect(holdLateBackfill(normal, now, 6000).some((s) => s.held)).toBe(false);
  });
  it('does not double count phone + watch when judging a late day', () => {
    const phone = days(2500, [0, 1, 2, 3, 4, 5]); // 15k/day
    const watch = days(2600, [0, 1, 2, 3, 4, 5], 'com.apple.health.WATCH999');
    expect(holdLateBackfill([...phone, ...watch], now, 8000).some((s) => s.held)).toBe(false);
  });
  it('scales the bar with a genuinely active person', () => {
    const trader = days(3000, [0, 1, 2, 3, 4, 5, 6, 7, 8]); // 27k/day, normal for them
    expect(holdLateBackfill(trader, now, 25000).some((s) => s.held)).toBe(false);
  });
});

describe('goals', () => {
  it('derives a robust baseline from the median day', () => {
    expect(baselineFrom([4000, 5000, 6000, 30000, 0, 0, 5500])).toBe(5500);
    expect(baselineFrom([4000, 0])).toBe(0);
  });
  it('clamps and rounds daily targets, and scales by duration', () => {
    expect(dailyTarget(0)).toBe(7000); // default 6000 × 1.15 → 6900 → 7000
    expect(dailyTarget(2000)).toBe(5000);
    expect(dailyTarget(40000)).toBe(20000);
    expect(challengeGoal(8000, 168)).toBe(9000 * 7);
  });
});

describe('payout splits', () => {
  it('splits credits evenly with remainder to the house', () => {
    expect(splitPool(1000, 3)).toEqual({ per: 333, remainder: 1 });
    expect(splitPool(500, 0)).toEqual({ per: 0, remainder: 500 });
  });
  it('splits sponsor cash to the pesewa, rounding down', () => {
    expect(splitPrize(1000, 3)).toBe(333.33);
  });
});
