// The walk recorder. One engine, fed by a background location task, so recording carries on with the
// phone locked. It needs only "While Using" location: the walker starts it themselves, in the app.
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { create } from 'zustand';

import {
  addFix,
  cumulative,
  pauseTrack,
  resumeTrack,
  routeProgress,
  startTrack,
  walkStats,
  type Fix,
  type PlannedRoute,
  type RouteProgress,
  type StepSample,
  type TrackState,
  type TrackStatus,
  type WalkStats,
} from '@/shared/walk';

import { api } from '../api';
import { useSession } from '../session';
import { onFinish, onRouteProgress, onTrackEvent, resetAlerts } from './alerts';
import { live, type LiveCommand, type LiveSnapshot } from './live';
import { activeWalk, newId, thumbLine, useWalks } from './store';
import type { SavedWalk } from './types';

const TASK = 'steppool-walk-location';
/** Shorter than this isn't worth keeping (a mis-tap, or a start with no GPS). */
export const MIN_WALK_M = 50;
const LIVE_EVERY_MS = 3000;
const PERSIST_EVERY_MS = 10_000;
const STEP_SAMPLE_MS = 5000;

export type GpsQuality = 'searching' | 'weak' | 'ok';

type RecorderState = {
  status: 'idle' | TrackStatus;
  track: TrackState | null;
  stats: WalkStats | null;
  steps: StepSample[];
  gps: GpsQuality;
  /** The planned route being followed, if any. */
  nav: { name: string; route: PlannedRoute; progress: RouteProgress | null } | null;
  /** Steps couldn't be counted (permission refused or no sensor). */
  noSteps: boolean;
};

export const useRecorder = create<RecorderState>(() => ({ status: 'idle', track: null, stats: null, steps: [], gps: 'searching', nav: null, noSteps: false }));

/** Everything needed to pick a walk back up after the app is killed mid-recording. */
type Persisted = { track: TrackState; steps: StepSample[]; stepOffset: number; nav: { name: string; route: PlannedRoute } | null };

// Engine state lives outside React: the location task can run with no screen mounted.
let track: TrackState | null = null;
let steps: StepSample[] = [];
/** Pedometer total since the walk started, and the part of it taken while paused. */
let rawSteps = 0;
let stepOffset = 0;
let pausedAtSteps = 0;
/** Added to the pedometer's own count after a restart, when it begins again from zero. */
let stepBase = 0;
let nav: { name: string; route: PlannedRoute } | null = null;
let cum: number[] = [];
let along = 0;
let pedometer: { remove(): void } | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let lastLive = 0;
let lastPersist = 0;
let noSteps = false;

const prefs = () => {
  useWalks.getState().load();
  return useWalks.getState().prefs;
};

const countedSteps = () => Math.max(0, rawSteps - stepOffset);

function gpsOf(t: TrackState): GpsQuality {
  if (!t.last) return 'searching';
  return (t.last.acc ?? 0) > 30 ? 'weak' : 'ok';
}

function snapshot(t: TrackState, stats: WalkStats, progress: RouteProgress | null): LiveSnapshot {
  return {
    status: t.status,
    distance: t.distance,
    movingMs: t.movingMs,
    speed: t.status === 'recording' ? t.speed : 0,
    pace: stats.pace,
    steps: stats.steps,
    turn: progress ? (progress.arrived ? 'You have arrived' : progress.offRoute ? 'Off route: head back to the line' : progress.next?.text) : undefined,
    turnKind: progress ? (progress.arrived ? 'arrive' : progress.offRoute ? 'off' : progress.next?.kind) : undefined,
    turnIn: progress && !progress.arrived && !progress.offRoute ? progress.toNext : undefined,
  };
}

/** Pushes the current state to the UI store, the lock-screen surface and (now and then) to disk. */
function publish(force = false) {
  if (!track) return;
  const now = Date.now();
  const stats = walkStats(track, steps, now);
  const progress = useRecorder.getState().nav?.progress ?? null;
  useRecorder.setState({ status: track.status, track, stats, steps, gps: gpsOf(track), noSteps });
  if (force || now - lastLive >= LIVE_EVERY_MS) {
    lastLive = now;
    void live.update(snapshot(track, stats, progress));
  }
  if (force || now - lastPersist >= PERSIST_EVERY_MS) {
    lastPersist = now;
    activeWalk.write({ track, steps, stepOffset, nav } satisfies Persisted);
  }
}

function recordSteps(total: number) {
  if (!track || total <= rawSteps) return;
  rawSteps = total;
  const t = Date.now();
  const last = steps[steps.length - 1];
  const sample = { t, steps: countedSteps() };
  // One sample every few seconds is plenty for cadence, and keeps a long walk's file small.
  if (last && t - last.t < STEP_SAMPLE_MS) steps = [...steps.slice(0, -1), { ...sample, t: last.t }];
  else steps = [...steps, sample];
}

async function startPedometer() {
  try {
    if (!(await Pedometer.isAvailableAsync())) throw new Error('unavailable');
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) throw new Error('denied');
    noSteps = false;
    pedometer?.remove();
    // The subscription counts from when it starts, so after a restart it continues from the saved total.
    stepBase = rawSteps;
    pedometer = Pedometer.watchStepCount((r) => {
      if (track?.status === 'paused') return;
      recordSteps(stepBase + r.steps);
    });
  } catch {
    noSteps = true;
  }
}

/** iPhone can also answer "how many steps since the start", which survives the app being suspended. */
async function reconcileSteps() {
  if (Platform.OS !== 'ios' || !track || noSteps) return;
  try {
    const { steps: total } = await Pedometer.getStepCountAsync(new Date(track.startedAt), new Date());
    if (total > rawSteps && track.status !== 'paused') {
      recordSteps(total);
      stepBase = Math.max(stepBase, total); // later subscription updates must not fall below it
    }
  } catch {
    // history query unavailable: the live subscription is enough
  }
}

function onFix(fix: Fix) {
  if (!track) return;
  const { state, events } = addFix(track, fix);
  track = state;
  const stats = walkStats(track, steps, Date.now());
  const p = prefs();
  for (const e of events) onTrackEvent(e, stats, p);
  if (nav && track.status === 'recording' && (fix.acc ?? 0) <= 30) {
    const progress = routeProgress(nav.route, cum, fix, along);
    if (!progress.offRoute) along = Math.max(along, progress.along);
    useRecorder.setState({ nav: { ...nav, progress } });
    onRouteProgress(progress, p);
  }
  publish(events.length > 0);
}

/** Restores a walk that was in progress when the app was killed. Returns true if there was one. */
function restore(): boolean {
  if (track) return true;
  const saved = activeWalk.read<Persisted>();
  if (!saved?.track) return false;
  track = saved.track;
  steps = saved.steps ?? [];
  stepOffset = saved.stepOffset ?? 0;
  rawSteps = (steps[steps.length - 1]?.steps ?? 0) + stepOffset;
  nav = saved.nav ?? null;
  cum = nav ? cumulative(nav.route.coords) : [];
  along = 0;
  useRecorder.setState({ nav: nav ? { ...nav, progress: null } : null });
  void startPedometer();
  startTicker();
  publish(true);
  return true;
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  // Headless start (the system relaunched us for a location): pick the walk back up from disk.
  // Walks are stored per account, so the session has to be read first.
  if (!track && !useSession.getState().me) await useSession.getState().hydrate().catch(() => {});
  if (!track && !restore()) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
    return;
  }
  for (const l of data.locations) {
    onFix({ t: l.timestamp, lat: l.coords.latitude, lng: l.coords.longitude, alt: l.coords.altitude, acc: l.coords.accuracy, speed: l.coords.speed });
  }
});

function startTicker() {
  if (ticker) return;
  let n = 0;
  ticker = setInterval(() => {
    const cmd = live.pending();
    if (cmd) void handle(cmd);
    if (++n % 15 === 0) void reconcileSteps();
    publish();
  }, 1000);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

async function handle(cmd: LiveCommand) {
  if (cmd === 'pause') recorder.pause();
  else if (cmd === 'resume') recorder.resume();
  // "Finish" from the lock screen only brings the app forward; the walker confirms on the record screen.
}
live.onCommand((c) => void handle(c));

async function stopEngine() {
  stopTicker();
  pedometer?.remove();
  pedometer = null;
  await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  activeWalk.clear();
  resetAlerts();
  void live.releaseVoice();
  track = null;
  steps = [];
  rawSteps = stepOffset = pausedAtSteps = stepBase = 0;
  nav = null;
  cum = [];
  along = 0;
  useRecorder.setState({ status: 'idle', track: null, stats: null, steps: [], gps: 'searching', nav: null });
}

export type StartResult = 'started' | 'location-denied' | 'location-off' | 'failed';

export const recorder = {
  /** Call once on launch: resumes the display of a walk that is still recording in the background. */
  async hydrate() {
    if (track) return;
    const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (running) restore();
    else activeWalk.clear(); // a walk that was cut off without its task can't be continued
  },

  async start(follow?: { name: string; route: PlannedRoute }): Promise<StartResult> {
    if (track) return 'started';
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return 'location-denied';
    if (!(await Location.hasServicesEnabledAsync().catch(() => true))) return 'location-off';

    const p = prefs();
    track = startTrack(Date.now(), p.autoPause);
    steps = [];
    rawSteps = stepOffset = pausedAtSteps = stepBase = 0;
    nav = follow ?? null;
    cum = nav ? cumulative(nav.route.coords) : [];
    along = 0;
    resetAlerts();
    useRecorder.setState({ nav: nav ? { ...nav, progress: null } : null });
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 0,
        deferredUpdatesInterval: 0,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        // Android keeps recording through this service; the live numbers are in the notification beside it.
        foregroundService: { notificationTitle: 'Recording your walk', notificationBody: 'StepPool is tracking this walk. Tap to open.', notificationColor: '#D7FF3A', killServiceOnDestroy: false },
      });
    } catch {
      track = null;
      nav = null;
      useRecorder.setState({ nav: null });
      return 'failed';
    }
    if (p.voice) void live.prepareVoice();
    void startPedometer();
    startTicker();
    const stats = walkStats(track, steps, Date.now());
    await live.start(snapshot(track, stats, null));
    publish(true);
    return 'started';
  },

  pause() {
    if (!track || track.status === 'paused') return;
    track = pauseTrack(track);
    pausedAtSteps = rawSteps;
    publish(true);
  },

  resume() {
    if (!track || track.status === 'recording') return;
    // Steps taken while paused (a shop, a bus) don't belong to the walk.
    if (track.status === 'paused') {
      stepOffset += Math.max(0, rawSteps - pausedAtSteps);
      void reconcilePausedSteps();
    }
    track = resumeTrack(track, Date.now());
    publish(true);
  },

  /** Saves the walk and returns its id, or null when it was too short to keep. */
  async finish(): Promise<string | null> {
    if (!track) return null;
    await reconcileSteps();
    const t = track;
    const now = Date.now();
    const stats = walkStats(t, steps, now);
    const followed = nav ? { name: nav.name, distance: nav.route.distance } : undefined;
    const finalLive = snapshot({ ...t, status: 'paused' }, stats, null);
    const samples = steps;
    await stopEngine();
    if (t.distance < MIN_WALK_M || t.points.length < 2) {
      await live.end();
      return null;
    }

    const store = useWalks.getState();
    store.load();
    const earlier = useWalks.getState().walks;
    const records: string[] = [];
    if (earlier.length && earlier.every((w) => t.distance > w.distance)) records.push('Longest walk');
    const bestKm = t.splits.length ? Math.min(...t.splits.map((s) => s.ms)) : null;
    const earlierBest = Math.min(...earlier.map((w) => w.bestKmMs ?? Infinity));
    if (bestKm != null && Number.isFinite(earlierBest) && bestKm < earlierBest) records.push('Fastest kilometre');

    const started = new Date(t.startedAt);
    const hour = started.getHours();
    const walk: SavedWalk = {
      id: newId(),
      name: followed?.name ?? `${hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'} walk`,
      startedAt: t.startedAt,
      endedAt: now,
      distance: Math.round(t.distance),
      movingMs: Math.round(t.movingMs),
      steps: stats.steps,
      gain: stats.gain,
      line: thumbLine(t.points),
      records: records.length ? records : undefined,
      bestKmMs: bestKm ?? undefined,
      points: t.points,
      stepSamples: samples,
      splits: t.splits,
      stats,
      followed,
    };
    store.save(walk);
    await live.end(finalLive);
    onFinish(stats, records, prefs());
    void snapLater(walk);
    return walk.id;
  },

  async discard() {
    await stopEngine();
    await live.end();
  },
};

/** While paused, iPhone's history query would count the paused steps too; fold them into the offset. */
async function reconcilePausedSteps() {
  if (Platform.OS !== 'ios' || !track || noSteps) return;
  try {
    const { steps: total } = await Pedometer.getStepCountAsync(new Date(track.startedAt), new Date());
    if (total > rawSteps) {
      stepOffset += total - rawSteps;
      rawSteps = total;
      stepBase = Math.max(stepBase, total);
    }
  } catch {
    // keep the subscription's count
  }
}

/** After saving, asks the server to snap the trace onto mapped paths; kept only when the match is good. */
async function snapLater(walk: SavedWalk) {
  try {
    // A thinned trace keeps the request small; snapping needs the shape, not every fix.
    const stride = Math.max(1, Math.ceil(walk.points.length / 600));
    const points = walk.points.filter((_, i) => i % stride === 0 || i === walk.points.length - 1).map((p) => ({ lng: p.lng, lat: p.lat, t: p.t }));
    if (points.length < 2) return;
    const { snapped } = await api.snap(points);
    if (!snapped) return;
    const current = useWalks.getState().get(walk.id);
    if (current) useWalks.getState().save({ ...current, snapped });
  } catch {
    // offline or outside the mapped area: the raw trace stands
  }
}
