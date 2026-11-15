import type { Maneuver, Split, StepSample, TrackPoint, WalkStats } from '@/shared/walk';

/** What the list, heatmap and comparison need, kept in one small index file. */
export interface WalkMeta {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  distance: number;
  movingMs: number;
  steps: number;
  gain: number;
  /** A thinned-out [lng, lat] line: enough to draw the route small or on the heatmap. */
  line: [number, number][];
  /** Personal bests this walk set, e.g. "Longest walk". */
  records?: string[];
  /** Fastest kilometre split of this walk, ms. */
  bestKmMs?: number;
}

export interface SavedWalk extends WalkMeta {
  points: TrackPoint[];
  stepSamples: StepSample[];
  splits: Split[];
  stats: WalkStats;
  /** The route snapped to mapped paths, when the snap was trustworthy. */
  snapped?: { coords: [number, number][]; distance: number };
  /** The planned route that was being followed, if any. */
  followed?: { name: string; distance: number };
}

export interface SavedRoute {
  id: string;
  name: string;
  createdAt: number;
  coords: [number, number][];
  distance: number;
  duration: number;
  maneuvers: Maneuver[];
}

export interface WalkPrefs {
  /** A notification at every kilometre. */
  kmAlerts: boolean;
  /** Spoken updates at every kilometre and for turns. */
  voice: boolean;
  /** Fastest kilometre and longest walk. */
  records: boolean;
  autoPause: boolean;
}

export const DEFAULT_PREFS: WalkPrefs = { kmAlerts: true, voice: true, records: true, autoPause: true };
