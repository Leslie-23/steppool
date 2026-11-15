import { describe, expect, it } from 'vitest';

import {
  addFix,
  boundsOf,
  colourSegments,
  cumulative,
  distanceM,
  fmtDistanceShort,
  fmtDuration,
  fmtPace,
  maxCadence,
  pauseTrack,
  positionAt,
  resumeTrack,
  routeProgress,
  sameRoute,
  sayDuration,
  simplifyIndices,
  startTrack,
  walkStats,
  type Fix,
  type PlannedRoute,
  type TrackEvent,
  type TrackState,
} from '../../shared/walk.js';

const T0 = Date.UTC(2027, 0, 4, 7);
const ORIGIN = { lat: 5.6037, lng: -0.187 }; // Accra
/** A point `north` and `east` metres from the origin. */
const M_PER_DEG = (6_371_000 * Math.PI) / 180; // the same sphere the distance maths uses
const at = (north: number, east: number) => ({ lat: ORIGIN.lat + north / M_PER_DEG, lng: ORIGIN.lng + east / (M_PER_DEG * Math.cos((ORIGIN.lat * Math.PI) / 180)) });

function feed(state: TrackState, fixes: Fix[]) {
  const events: TrackEvent[] = [];
  for (const f of fixes) {
    const r = addFix(state, f);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Walks north at `speed` m/s for `seconds`, one fix every `every` seconds. */
const walkNorth = (fromT: number, fromNorth: number, seconds: number, speed = 1.4, every = 2, extra: Partial<Fix> = {}): Fix[] =>
  Array.from({ length: Math.floor(seconds / every) + 1 }, (_, i) => ({ t: fromT + i * every * 1000, ...at(fromNorth + i * every * speed, 0), acc: 5, alt: 30, ...extra }));

describe('walk tracking', () => {
  it('measures a steady walk: distance, moving time, pace and kilometre splits', () => {
    const { state, events } = feed(startTrack(T0), walkNorth(T0, 0, 1100));
    expect(state.distance).toBeGreaterThan(1535);
    expect(state.distance).toBeLessThan(1545); // 1,100 s × 1.4 m/s = 1,540 m
    expect(Math.round(state.movingMs / 1000)).toBe(1100);
    expect(state.speed).toBeCloseTo(1.4, 1);
    const km = events.filter((e) => e.type === 'km');
    expect(km).toHaveLength(1);
    expect(km[0]).toMatchObject({ km: 1, fastest: false });
    expect(Math.round((km[0] as { ms: number }).ms / 1000)).toBeGreaterThanOrEqual(713);
    expect(Math.round((km[0] as { ms: number }).ms / 1000)).toBeLessThanOrEqual(716); // 1,000 m ÷ 1.4 m/s ≈ 714 s
    const stats = walkStats(state, [], T0 + 1_100_000);
    expect(fmtPace(stats.pace)).toBe('11:54');
  });

  it('flags the fastest kilometre once there is one to beat', () => {
    const slow = walkNorth(T0, 0, 1000, 1.0); // km 1 in 1,000 s
    const fast = walkNorth(T0 + 1_000_000, 1000, 600, 2.0); // km 2 in 500 s
    const { events } = feed(startTrack(T0), [...slow, ...fast.slice(1)]);
    const km = events.filter((e): e is Extract<TrackEvent, { type: 'km' }> => e.type === 'km');
    expect(km.map((k) => [k.km, k.fastest])).toEqual([[1, false], [2, true]]);
  });

  it('ignores GPS drift while standing, auto-pauses, and resumes on real movement', () => {
    let { state } = feed(startTrack(T0), walkNorth(T0, 0, 60));
    const walked = state.distance;
    const moving = state.movingMs;
    // Standing for 60 s with the fix wobbling a couple of metres.
    const wobble: Fix[] = Array.from({ length: 30 }, (_, i) => ({ t: T0 + 62_000 + i * 2000, ...at(84 + (i % 2 ? 2 : -2), i % 3), acc: 6, alt: 30 }));
    const still = feed(state, wobble);
    state = still.state;
    expect(still.events.map((e) => e.type)).toEqual(['autopause']);
    expect(state.status).toBe('autopaused');
    expect(state.distance).toBe(walked);
    expect(state.movingMs).toBeLessThanOrEqual(moving + 2000); // standing time isn't moving time
    // Sets off again.
    const again = feed(state, walkNorth(T0 + 124_000, 84, 40));
    expect(again.events.map((e) => e.type)).toEqual(['resume']);
    expect(again.state.status).toBe('recording');
    expect(again.state.distance).toBeGreaterThan(walked + 40);
    expect(again.state.distance).toBeLessThan(walked + 60);
  });

  it('never adds an inaccurate fix or an impossible jump to the route', () => {
    let { state } = feed(startTrack(T0), walkNorth(T0, 0, 30));
    const walked = state.distance;
    const points = state.points.length;
    const bad = feed(state, [{ t: T0 + 32_000, ...at(900, 400), acc: 80 }]);
    expect(bad.state.distance).toBe(walked);
    expect(bad.state.points).toHaveLength(points);
    expect(bad.state.last?.acc).toBe(80); // still shown on the accuracy indicator
    // A "teleport" 600 m away two seconds later, with a confident fix.
    const jump = feed(bad.state, [{ t: T0 + 34_000, ...at(642, 0), acc: 5 }]);
    expect(jump.state.distance).toBe(walked);
    // Recording carries on from the new position.
    state = feed(jump.state, walkNorth(T0 + 36_000, 644.8, 20)).state;
    expect(state.distance).toBeGreaterThan(walked + 20);
    expect(state.distance).toBeLessThan(walked + 35);
  });

  it('warns once about a weak signal, then says when it is back', () => {
    const weak: Fix[] = Array.from({ length: 15 }, (_, i) => ({ t: T0 + i * 2000, ...at(0, 0), acc: 60 }));
    const lost = feed(startTrack(T0), weak);
    expect(lost.events.map((e) => e.type)).toEqual(['gps-weak']);
    expect(feed(lost.state, [{ t: T0 + 32_000, ...at(0, 0), acc: 6 }]).events.map((e) => e.type)).toEqual(['gps-ok']);
  });

  it('adds no distance or time while paused, even if you move', () => {
    let { state } = feed(startTrack(T0), walkNorth(T0, 0, 60));
    const walked = state.distance;
    state = pauseTrack(state);
    state = feed(state, walkNorth(T0 + 62_000, 84, 300)).state; // a 420 m stroll while paused
    expect(state.distance).toBe(walked);
    state = resumeTrack(state, T0 + 364_000);
    state = feed(state, walkNorth(T0 + 364_000, 504, 60)).state;
    expect(state.distance).toBeGreaterThan(walked + 78);
    expect(state.distance).toBeLessThan(walked + 90);
    expect(Math.round(state.movingMs / 1000)).toBe(120);
  });

  it('counts climbs in steps so altitude jitter does not add up', () => {
    const flat: Fix[] = walkNorth(T0, 0, 600).map((f, i) => ({ ...f, alt: 30 + (i % 2 ? 1.5 : -1.5) }));
    expect(feed(startTrack(T0), flat).state.gain).toBe(0);
    const hill: Fix[] = walkNorth(T0, 0, 600).map((f, i) => ({ ...f, alt: 30 + i * 0.1 })); // +30 m
    const g = feed(startTrack(T0), hill).state.gain;
    expect(g).toBeGreaterThan(24);
    expect(g).toBeLessThan(31);
  });

  it('derives cadence, peak cadence and stride from step samples', () => {
    const { state } = feed(startTrack(T0), walkNorth(T0, 0, 600)); // 840 m in 10 min
    const steps = Array.from({ length: 61 }, (_, i) => ({ t: T0 + i * 10_000, steps: i < 30 ? i * 18 : 540 + (i - 30) * 22 })); // 108 then 132 a minute
    const stats = walkStats(state, steps, T0 + 600_000);
    expect(stats.steps).toBe(1200);
    expect(stats.cadence).toBe(120);
    expect(maxCadence(steps)).toBe(132);
    expect(stats.stride).toBeCloseTo(0.7, 1);
  });
});

describe('route helpers', () => {
  const { state } = feed(startTrack(T0), walkNorth(T0, 0, 400, 1.5));

  it('colours segments on a 0–1 scale and reports bounds', () => {
    const mixed = feed(startTrack(T0), [...walkNorth(T0, 0, 200, 1.0), ...walkNorth(T0 + 202_000, 202, 200, 2.0)]).state;
    const { segments } = colourSegments(mixed.points, 'pace');
    expect(segments.length).toBe(mixed.points.length - 1);
    expect(segments[5].v).toBeLessThan(0.2);
    expect(segments[segments.length - 5].v).toBeGreaterThan(0.8);
    expect(colourSegments(mixed.points, 'plain').segments.every((s) => s.v === 1)).toBe(true);
    const b = boundsOf(mixed.points)!;
    expect(b[1]).toBeLessThan(ORIGIN.lat);
    expect(b[3]).toBeGreaterThan(at(590, 0).lat);
  });

  it('replays to any moment of moving time', () => {
    const half = positionAt(state.points, state.movingMs / 2)!;
    expect(half.d).toBeCloseTo(state.distance / 2, -1);
    expect(distanceM(half, at(300, 0))).toBeLessThan(5);
    expect(half.heading).toBeLessThan(1); // heading north
    expect(positionAt(state.points, -5)!.d).toBe(0);
    expect(positionAt(state.points, 9e9)!.d).toBeCloseTo(state.distance, 0);
  });

  it('simplifies a straight line to its ends and keeps a corner', () => {
    expect(simplifyIndices(state.points, 5)).toEqual([0, state.points.length - 1]);
    const corner = [...Array.from({ length: 20 }, (_, i) => at(i * 10, 0)), ...Array.from({ length: 20 }, (_, i) => at(190, (i + 1) * 10))];
    expect(simplifyIndices(corner, 5)).toEqual([0, 19, 39]);
  });

  it('follows a planned route: next turn, distance to it, off-route and arrival', () => {
    const coords = [at(0, 0), at(200, 0), at(200, 300)].map((p) => [p.lng, p.lat] as [number, number]);
    const route: PlannedRoute = { coords, distance: 500, duration: 360, maneuvers: [{ at: 0, text: 'Head north', kind: 'depart' }, { at: 200, text: 'Turn right onto Oxford St', kind: 'right', street: 'Oxford St' }, { at: 500, text: 'You have arrived', kind: 'arrive' }] };
    const cum = cumulative(coords);
    expect(cum[2]).toBeCloseTo(500, 0);
    const early = routeProgress(route, cum, at(80, 3));
    expect(early).toMatchObject({ offRoute: false, arrived: false });
    expect(early.next?.kind).toBe('right');
    expect(early.toNext).toBeCloseTo(120, 0);
    expect(fmtDistanceShort(early.toNext)).toBe('120 m');
    const after = routeProgress(route, cum, at(203, 100), early.along);
    expect(after.next?.kind).toBe('arrive');
    expect(after.toNext).toBeCloseTo(200, 0);
    expect(routeProgress(route, cum, at(80, 90)).offRoute).toBe(true);
    expect(routeProgress(route, cum, at(200, 292), after.along).arrived).toBe(true);
  });

  it('recognises two walks over the same ground', () => {
    const a = Array.from({ length: 80 }, (_, i) => at(i * 10, 0));
    const b = Array.from({ length: 70 }, (_, i) => at(i * 11.4, 6)); // same street, different sampling
    const elsewhere = Array.from({ length: 80 }, (_, i) => at(0, 300 + i * 10));
    expect(sameRoute(a, b, 790, 787)).toBe(true);
    expect(sameRoute(a, elsewhere, 790, 790)).toBe(false);
    expect(sameRoute(a, b.slice(0, 30), 790, 330)).toBe(false);
  });

  it('formats times, paces and spoken durations', () => {
    expect(fmtDuration(24 * 60_000 + 18_000)).toBe('24:18');
    expect(fmtDuration(3_849_000)).toBe('1:04:09');
    expect(fmtPace(426)).toBe('7:06');
    expect(fmtPace(null)).toBe('–:––');
    expect(sayDuration(402_000)).toBe('6 minutes 42 seconds');
    expect(sayDuration(60_000)).toBe('1 minute');
    expect(fmtDistanceShort(1432)).toBe('1.4 km');
  });
});
