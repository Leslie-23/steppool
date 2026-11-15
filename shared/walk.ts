// Walk recording: turns raw GPS fixes into a clean route, distance, pace, splits and elevation.
// Pure functions with no platform code, so the same logic runs in the app, in the background task and in tests.

/** One GPS reading. `t` is epoch ms; `acc` is horizontal accuracy in metres; `speed` in m/s when the device reports it. */
export interface Fix {
  t: number;
  lat: number;
  lng: number;
  alt?: number | null;
  acc?: number | null;
  speed?: number | null;
}

/** A point kept on the route. `d` is metres from the start, `m` moving-time ms from the start, `v` smoothed speed in m/s. */
export interface TrackPoint {
  t: number;
  lat: number;
  lng: number;
  alt?: number;
  d: number;
  m: number;
  v: number;
}

export interface Split {
  km: number;
  /** Moving time for this kilometre, ms. */
  ms: number;
  gain: number;
  loss: number;
}

export type TrackStatus = 'recording' | 'paused' | 'autopaused';

export interface TrackState {
  startedAt: number;
  status: TrackStatus;
  points: TrackPoint[];
  distance: number;
  movingMs: number;
  /** Last fix of any quality, for the accuracy indicator and the map dot. */
  last?: Fix;
  /** Where we were when movement last counted; drift around it is ignored. */
  anchor?: Fix;
  /** Time of the last fix that moved us, for auto-pause. */
  movedAt: number;
  /** Clock of the previous usable fix, to add moving time. */
  clock: number;
  speed: number;
  maxSpeed: number;
  /** Smoothed altitude and the level it last counted gain/loss from. */
  alt?: number;
  altRef?: number;
  gain: number;
  loss: number;
  splits: Split[];
  /** Totals at the start of the kilometre in progress. */
  splitStart: { ms: number; gain: number; loss: number };
  weakSince?: number;
  autoPause: boolean;
}

export type TrackEvent =
  | { type: 'km'; km: number; ms: number; fastest: boolean }
  | { type: 'autopause' }
  | { type: 'resume' }
  | { type: 'gps-weak' }
  | { type: 'gps-ok' };

export const TRACK = {
  /** Fixes worse than this are shown but never added to the route. */
  maxAccuracyM: 30,
  /** Faster than this between two fixes is a GPS jump, not a person on foot. */
  maxSpeedMs: 8,
  /** Movement smaller than this (or than the fix's own uncertainty) is drift. */
  minMoveM: 4,
  autoPauseAfterMs: 20_000,
  /** Leaving this radius around the pause point resumes recording. */
  resumeMoveM: 8,
  /** A gap longer than this between fixes doesn't count as moving time. */
  maxGapMs: 15_000,
  speedWindowMs: 12_000,
  weakAfterMs: 20_000,
  elevationStepM: 3,
} as const;

const R = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a to b, 0–360. */
export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function startTrack(now: number, autoPause = true): TrackState {
  return { startedAt: now, status: 'recording', points: [], distance: 0, movingMs: 0, movedAt: now, clock: now, speed: 0, maxSpeed: 0, gain: 0, loss: 0, splits: [], splitStart: { ms: 0, gain: 0, loss: 0 }, autoPause };
}

export function pauseTrack(s: TrackState): TrackState {
  return s.status === 'paused' ? s : { ...s, status: 'paused', speed: 0 };
}

/** Resuming starts a fresh segment: the gap while paused adds neither distance nor time. */
export function resumeTrack(s: TrackState, now: number): TrackState {
  return s.status === 'recording' ? s : { ...s, status: 'recording', anchor: undefined, movedAt: now, clock: now };
}

/** Speed over the recent window, so one noisy fix can't swing the pace. */
function windowSpeed(points: TrackPoint[], next: { t: number; d: number; m: number }) {
  let i = points.length - 1;
  while (i > 0 && next.t - points[i].t < TRACK.speedWindowMs) i--;
  const from = points[i];
  if (!from) return 0;
  const ms = next.m - from.m;
  return ms > 500 ? ((next.d - from.d) / ms) * 1000 : 0;
}

/**
 * Feeds one GPS fix into the track. Returns the new state and anything worth telling the walker about.
 * Bad fixes update `last` (for the accuracy indicator) but never the route.
 */
export function addFix(prev: TrackState, fix: Fix): { state: TrackState; events: TrackEvent[] } {
  const events: TrackEvent[] = [];
  const s: TrackState = { ...prev, last: fix };
  if (fix.t < prev.clock - 1000) return { state: prev, events }; // out of order

  const acc = fix.acc ?? 0;
  if (acc > TRACK.maxAccuracyM) {
    if (s.weakSince == null) s.weakSince = fix.t;
    else if (s.weakSince > 0 && fix.t - s.weakSince >= TRACK.weakAfterMs) {
      events.push({ type: 'gps-weak' });
      s.weakSince = -1; // told once; reset when the signal returns
    }
    return { state: s, events };
  }
  if (s.weakSince === -1) events.push({ type: 'gps-ok' });
  s.weakSince = undefined;

  if (s.status === 'paused') return { state: s, events };

  // First usable fix of a segment: it becomes the anchor and (when recording) a route point.
  if (!s.anchor) {
    s.anchor = fix;
    s.movedAt = fix.t;
    s.clock = fix.t;
    s.points = [...s.points, { t: fix.t, lat: fix.lat, lng: fix.lng, alt: fix.alt ?? undefined, d: s.distance, m: s.movingMs, v: 0 }];
    if (fix.alt != null && s.alt == null) s.alt = s.altRef = fix.alt;
    return { state: s, events };
  }

  const moved = distanceM(s.anchor, fix);
  const dt = fix.t - s.anchor.t;
  const need = s.status === 'autopaused' ? TRACK.resumeMoveM : Math.max(TRACK.minMoveM, acc * 0.5);

  if (moved < need) {
    // Standing still (or drifting). Time keeps counting only until auto-pause decides we've stopped.
    if (s.status === 'recording' && s.autoPause && fix.t - s.movedAt >= TRACK.autoPauseAfterMs) {
      s.status = 'autopaused';
      s.speed = 0;
      // The seconds spent standing before we noticed weren't moving time.
      s.movingMs = Math.max(0, s.movingMs - Math.min(fix.t - s.movedAt, s.clock - s.movedAt));
      events.push({ type: 'autopause' });
    } else if (s.status === 'recording') {
      const gap = fix.t - s.clock;
      if (gap > 0 && gap <= TRACK.maxGapMs) s.movingMs += gap;
      s.speed = windowSpeed(s.points, { t: fix.t, d: s.distance, m: s.movingMs });
    }
    s.clock = fix.t;
    return { state: s, events };
  }

  // A jump no one on foot could make: move the anchor so we recover, but don't count the distance.
  if (dt > 0 && moved / (dt / 1000) > TRACK.maxSpeedMs) {
    s.anchor = fix;
    s.clock = fix.t;
    s.movedAt = fix.t;
    return { state: s, events };
  }

  if (s.status === 'autopaused') {
    s.status = 'recording';
    events.push({ type: 'resume' });
    // Movement that woke us up starts the new segment; it isn't counted against the paused time.
    s.anchor = fix;
    s.clock = fix.t;
    s.movedAt = fix.t;
    s.points = [...s.points, { t: fix.t, lat: fix.lat, lng: fix.lng, alt: fix.alt ?? undefined, d: s.distance, m: s.movingMs, v: 0 }];
    return { state: s, events };
  }

  const gap = fix.t - s.clock;
  if (gap > 0 && gap <= TRACK.maxGapMs) s.movingMs += gap;
  const before = s.distance;
  s.distance += moved;
  s.anchor = fix;
  s.clock = fix.t;
  s.movedAt = fix.t;

  // Elevation: smooth the altitude, then count it in steps so GPS jitter doesn't add up to a mountain.
  if (fix.alt != null) {
    s.alt = s.alt == null ? fix.alt : s.alt + (fix.alt - s.alt) * 0.25;
    if (s.altRef == null) s.altRef = s.alt;
    const dz = s.alt - s.altRef;
    if (dz >= TRACK.elevationStepM) {
      s.gain += dz;
      s.altRef = s.alt;
    } else if (dz <= -TRACK.elevationStepM) {
      s.loss += -dz;
      s.altRef = s.alt;
    }
  }

  const next = { t: fix.t, d: s.distance, m: s.movingMs };
  s.speed = windowSpeed(s.points, next);
  s.maxSpeed = Math.max(s.maxSpeed, s.speed);
  s.points = [...s.points, { t: fix.t, lat: fix.lat, lng: fix.lng, alt: s.alt, d: s.distance, m: s.movingMs, v: s.speed }];

  // Kilometre splits. The moving time at the exact crossing is interpolated.
  for (let km = Math.floor(before / 1000) + 1; km <= Math.floor(s.distance / 1000); km++) {
    const frac = moved > 0 ? (km * 1000 - before) / moved : 1;
    const at = s.movingMs - (1 - frac) * Math.min(gap, TRACK.maxGapMs);
    const ms = Math.round(at - s.splitStart.ms);
    const fastest = s.splits.length > 0 && s.splits.every((x) => ms < x.ms);
    s.splits = [...s.splits, { km, ms, gain: Math.round(s.gain - s.splitStart.gain), loss: Math.round(s.loss - s.splitStart.loss) }];
    s.splitStart = { ms: at, gain: s.gain, loss: s.loss };
    events.push({ type: 'km', km, ms, fastest });
  }
  return { state: s, events };
}

export interface StepSample {
  t: number;
  /** Steps since the walk started. */
  steps: number;
}

export interface WalkStats {
  distance: number;
  movingMs: number;
  elapsedMs: number;
  /** Seconds per km, or null before any distance. */
  pace: number | null;
  avgSpeed: number;
  maxSpeed: number;
  gain: number;
  loss: number;
  steps: number;
  /** Steps per minute of moving time. */
  cadence: number;
  maxCadence: number;
  /** Metres per step. */
  stride: number;
}

/** Highest steps-per-minute over any ~30 s stretch. */
export function maxCadence(samples: StepSample[]) {
  let best = 0;
  let j = 0;
  for (let i = 1; i < samples.length; i++) {
    while (samples[i].t - samples[j].t > 45_000) j++;
    const ms = samples[i].t - samples[j].t;
    if (ms >= 20_000) best = Math.max(best, ((samples[i].steps - samples[j].steps) / ms) * 60_000);
  }
  return Math.round(Math.min(best, 260));
}

export function walkStats(s: Pick<TrackState, 'distance' | 'movingMs' | 'startedAt' | 'maxSpeed' | 'gain' | 'loss'>, steps: StepSample[], now: number): WalkStats {
  const total = steps.length ? steps[steps.length - 1].steps : 0;
  const minutes = s.movingMs / 60_000;
  return {
    distance: s.distance,
    movingMs: s.movingMs,
    elapsedMs: Math.max(0, now - s.startedAt),
    pace: s.distance >= 20 ? s.movingMs / 1000 / (s.distance / 1000) : null,
    avgSpeed: s.movingMs > 0 ? s.distance / (s.movingMs / 1000) : 0,
    maxSpeed: s.maxSpeed,
    gain: Math.round(s.gain),
    loss: Math.round(s.loss),
    steps: total,
    cadence: minutes > 0.25 ? Math.round(total / minutes) : 0,
    maxCadence: maxCadence(steps),
    stride: total > 20 ? s.distance / total : 0,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

export const fmtKm = (m: number, digits = 2) => (m / 1000).toFixed(digits);
/** 24:18, or 1:04:09 past the hour. */
export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
/** Seconds per km as 7:06. */
export function fmtPace(secPerKm: number | null | undefined) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm > 3600) return '–:––';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export const fmtSpeed = (ms: number) => (ms * 3.6).toFixed(1);
export const paceOf = (speedMs: number) => (speedMs > 0.2 ? 1000 / speedMs : null);
/** Spoken form: "6 minutes 42 seconds". */
export function sayDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const parts = [m ? `${m} minute${m === 1 ? '' : 's'}` : '', sec || !m ? `${sec} second${sec === 1 ? '' : 's'}` : ''];
  return parts.filter(Boolean).join(' ');
}

// ── Route colouring ───────────────────────────────────────────────────────────

export type Overlay = 'plain' | 'pace' | 'speed' | 'elevation' | 'gradient';

export interface ColouredSegment {
  from: [number, number];
  to: [number, number];
  /** 0 (low) to 1 (high) for the chosen measure. */
  v: number;
}

/** Percentile, so one odd reading doesn't flatten the colour scale. */
function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(sorted.length - 1, lo + 1)] - sorted[lo]) * (i - lo);
}

/**
 * Splits the route into segments carrying a 0–1 value for the overlay. For pace and speed, 1 is fastest;
 * for elevation, 1 is highest; for gradient, 1 is steepest uphill and 0 steepest downhill.
 */
export function colourSegments(points: TrackPoint[], overlay: Overlay): { segments: ColouredSegment[]; min: number; max: number } {
  if (points.length < 2) return { segments: [], min: 0, max: 0 };
  const raw: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (overlay === 'elevation') raw.push(((a.alt ?? 0) + (b.alt ?? 0)) / 2);
    else if (overlay === 'gradient') {
      // Gradient over a ~40 m look-back, since altitude between neighbouring fixes is mostly noise.
      let j = i - 1;
      while (j > 0 && b.d - points[j].d < 40) j--;
      const run = b.d - points[j].d;
      raw.push(run > 5 && b.alt != null && points[j].alt != null ? ((b.alt - points[j].alt!) / run) * 100 : 0);
    } else raw.push(b.v);
  }
  const sorted = [...raw].sort((x, y) => x - y);
  let min = quantile(sorted, 0.05);
  let max = quantile(sorted, 0.95);
  if (overlay === 'gradient') {
    const span = Math.max(2, Math.abs(min), Math.abs(max));
    min = -span;
    max = span;
  }
  const range = max - min || 1;
  const segments = raw.map((val, i) => ({
    from: [points[i].lng, points[i].lat] as [number, number],
    to: [points[i + 1].lng, points[i + 1].lat] as [number, number],
    v: overlay === 'plain' ? 1 : Math.min(1, Math.max(0, (val - min) / range)),
  }));
  return { segments, min, max };
}

/** [west, south, east, north] with a little margin, or null for an empty route. */
export function boundsOf(points: { lat: number; lng: number }[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  const padLat = Math.max(0.0005, (n - s) * 0.12);
  const padLng = Math.max(0.0005, (e - w) * 0.12);
  return [w - padLng, s - padLat, e + padLng, n + padLat];
}

/** The points making up one kilometre, for highlighting a split on the map. */
export function pointsInKm(points: TrackPoint[], km: number) {
  return points.filter((p) => p.d >= (km - 1) * 1000 && p.d <= km * 1000);
}

/** Evenly spaced (by distance) elevation samples for the profile chart. */
export function elevationProfile(points: TrackPoint[], buckets = 60): { d: number; alt: number }[] {
  const withAlt = points.filter((p) => p.alt != null);
  if (withAlt.length < 2) return [];
  const total = withAlt[withAlt.length - 1].d;
  const out: { d: number; alt: number }[] = [];
  let i = 0;
  for (let b = 0; b <= buckets; b++) {
    const d = (total * b) / buckets;
    while (i < withAlt.length - 2 && withAlt[i + 1].d < d) i++;
    const a = withAlt[i];
    const c = withAlt[i + 1];
    const f = c.d > a.d ? Math.min(1, Math.max(0, (d - a.d) / (c.d - a.d))) : 0;
    out.push({ d, alt: a.alt! + (c.alt! - a.alt!) * f });
  }
  return out;
}

// ── Replay ────────────────────────────────────────────────────────────────────

/** Where the walker was after `m` ms of moving time, interpolated between recorded points. */
export function positionAt(points: TrackPoint[], m: number): { lat: number; lng: number; d: number; v: number; alt?: number; index: number; heading: number } | null {
  if (!points.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (m <= points[0].m) hi = 0;
  else if (m >= points[hi].m) lo = hi;
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].m <= m) lo = mid;
      else hi = mid;
    }
  }
  const a = points[Math.min(lo, hi)];
  const b = points[Math.max(lo, hi)];
  const f = b.m > a.m ? Math.min(1, Math.max(0, (m - a.m) / (b.m - a.m))) : 0;
  const ahead = points[Math.min(points.length - 1, Math.max(lo, hi) + 2)];
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
    d: a.d + (b.d - a.d) * f,
    v: a.v + (b.v - a.v) * f,
    alt: a.alt != null && b.alt != null ? a.alt + (b.alt - a.alt) * f : a.alt,
    index: Math.min(lo, hi),
    heading: bearing(a, ahead === a ? b : ahead),
  };
}

// ── Simplifying a route (storage, snapping requests) ──────────────────────────

/** Douglas–Peucker on a flat-earth approximation; plenty accurate at walking scale. Returns kept indices. */
export function simplifyIndices(points: { lat: number; lng: number }[], toleranceM: number): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const k = Math.cos(rad(points[0].lat)) * 111_320;
  const xy = points.map((p) => [p.lng * k, p.lat * 110_540] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = 0;
    let at = -1;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > toleranceM && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < keep.length; i++) if (keep[i]) out.push(i);
  return out;
}

// ── Following a planned route ─────────────────────────────────────────────────

/** One instruction on a planned route. `at` is metres from the start of the route where it happens. */
export interface Maneuver {
  at: number;
  text: string;
  /** left, right, slight left, sharp right, straight, uturn, arrive, depart… */
  kind: string;
  street?: string;
}

export interface PlannedRoute {
  /** [lng, lat] pairs. */
  coords: [number, number][];
  distance: number;
  /** Walking time estimate in seconds. */
  duration: number;
  maneuvers: Maneuver[];
}

export interface RouteProgress {
  /** Metres along the route of the closest point to the walker. */
  along: number;
  /** Metres between the walker and the route. */
  off: number;
  offRoute: boolean;
  remaining: number;
  next: Maneuver | null;
  /** Metres to the next instruction. */
  toNext: number;
  arrived: boolean;
}

export const OFF_ROUTE_M = 45;

/** Cumulative distance at each vertex of a [lng, lat] line. */
export function cumulative(coords: [number, number][]) {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + distanceM({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] }));
  return out;
}

/**
 * Where the walker is on a planned route and what comes next. `minAlong` (the previous result) keeps
 * progress from snapping backwards on a loop that passes the same street twice.
 */
export function routeProgress(route: PlannedRoute, cum: number[], pos: { lat: number; lng: number }, minAlong = 0): RouteProgress {
  const k = Math.cos(rad(pos.lat)) * 111_320;
  const px = pos.lng * k;
  const py = pos.lat * 110_540;
  let best = { off: Infinity, along: 0 };
  for (let i = 1; i < route.coords.length; i++) {
    if (cum[i] < minAlong - 60) continue;
    const ax = route.coords[i - 1][0] * k;
    const ay = route.coords[i - 1][1] * 110_540;
    const bx = route.coords[i][0] * k;
    const by = route.coords[i][1] * 110_540;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
    const off = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
    // Prefer the nearest segment, but don't leap far ahead for a marginally closer one.
    const along = cum[i - 1] + t * (cum[i] - cum[i - 1]);
    const penalty = Math.max(0, along - minAlong - 150) * 0.05;
    if (off + penalty < best.off) best = { off: off + penalty, along };
  }
  const off = Number.isFinite(best.off) ? best.off : 0;
  const along = best.along;
  const next = route.maneuvers.find((m) => m.at > along + 5 && m.kind !== 'depart') ?? null;
  const remaining = Math.max(0, route.distance - along);
  return { along, off, offRoute: off > OFF_ROUTE_M, remaining, next, toNext: next ? Math.max(0, next.at - along) : remaining, arrived: remaining < 25 && off < OFF_ROUTE_M };
}

/** "120 m", "1.4 km": distances as they are read at a glance. */
export function fmtDistanceShort(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

// ── Comparing two walks ───────────────────────────────────────────────────────

/** True when two walks cover the same ground: similar length, and each stays close to the other throughout. */
export function sameRoute(a: { lat: number; lng: number }[], b: { lat: number; lng: number }[], lengthA: number, lengthB: number) {
  if (a.length < 2 || b.length < 2) return false;
  if (Math.abs(lengthA - lengthB) / Math.max(lengthA, lengthB, 1) > 0.2) return false;
  const near = (from: { lat: number; lng: number }[], to: { lat: number; lng: number }[]) => {
    const step = Math.max(1, Math.floor(from.length / 25));
    const stepTo = Math.max(1, Math.floor(to.length / 200));
    let far = 0;
    let n = 0;
    for (let i = 0; i < from.length; i += step) {
      let best = Infinity;
      for (let j = 0; j < to.length; j += stepTo) best = Math.min(best, distanceM(from[i], to[j]));
      if (best > 60) far++;
      n++;
    }
    return far / n <= 0.2;
  };
  return near(a, b) && near(b, a);
}
