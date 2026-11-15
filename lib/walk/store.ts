// Walks and saved routes live on this phone only: one small index file plus one file per walk.
// Nothing here is uploaded; a route shows where someone lives, so it stays with them.
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import { simplifyIndices } from '@/shared/walk';

import { useSession } from '../session';

import { DEFAULT_PREFS, type SavedRoute, type SavedWalk, type WalkMeta, type WalkPrefs } from './types';

/** Each account has its own folder, so signing out keeps a person's walks and never shows them to the next person. */
const owner = () => useSession.getState().me?.id ?? 'signed-out';
const dir = () => new Directory(Paths.document, 'walks', owner());
const file = (name: string) => new File(dir(), name);

function ensureDir() {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const f = file(name);
    return f.exists ? (JSON.parse(f.textSync()) as T) : fallback;
  } catch {
    return fallback; // a half-written file must never brick the screen
  }
}

function writeJson(name: string, value: unknown) {
  ensureDir();
  const f = file(name);
  if (!f.exists) f.create({ intermediates: true, overwrite: true });
  f.write(JSON.stringify(value));
}

function remove(name: string) {
  try {
    const f = file(name);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Trims precision nobody can see (6 decimals is ~10 cm) so a long walk stays a small file. */
export function compact(w: SavedWalk): SavedWalk {
  return {
    ...w,
    points: w.points.map((p) => ({ t: p.t, lat: round(p.lat, 6), lng: round(p.lng, 6), alt: p.alt == null ? undefined : round(p.alt, 1), d: round(p.d, 1), m: Math.round(p.m), v: round(p.v, 2) })),
  };
}

/** A thinned line for lists and the heatmap. */
export function thumbLine(points: { lat: number; lng: number }[]): [number, number][] {
  return simplifyIndices(points, 8).map((i) => [round(points[i].lng, 5), round(points[i].lat, 5)]);
}

type WalksState = {
  /** The account the lists below were read for. */
  loaded: string | null;
  walks: WalkMeta[];
  routes: SavedRoute[];
  prefs: WalkPrefs;
  load: () => void;
  get: (id: string) => SavedWalk | null;
  save: (w: SavedWalk) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  saveRoute: (r: SavedRoute) => void;
  removeRoute: (id: string) => void;
  setPrefs: (p: Partial<WalkPrefs>) => void;
};

const metaOf = ({ id, name, startedAt, endedAt, distance, movingMs, steps, gain, line, records, bestKmMs }: SavedWalk): WalkMeta => ({ id, name, startedAt, endedAt, distance, movingMs, steps, gain, line, records, bestKmMs });

export const useWalks = create<WalksState>((set, get) => ({
  loaded: null,
  walks: [],
  routes: [],
  prefs: DEFAULT_PREFS,
  load: () => {
    if (get().loaded === owner()) return;
    set({ loaded: owner(), walks: readJson<WalkMeta[]>('index.json', []), routes: readJson<SavedRoute[]>('routes.json', []), prefs: { ...DEFAULT_PREFS, ...readJson<Partial<WalkPrefs>>('prefs.json', {}) } });
  },
  get: (id) => readJson<SavedWalk | null>(`walk-${id}.json`, null),
  save: (w) => {
    get().load();
    const saved = compact(w);
    writeJson(`walk-${w.id}.json`, saved);
    const walks = [metaOf(saved), ...get().walks.filter((x) => x.id !== w.id)].sort((a, b) => b.startedAt - a.startedAt);
    writeJson('index.json', walks);
    set({ walks });
  },
  rename: (id, name) => {
    const w = get().get(id);
    if (w) get().save({ ...w, name });
  },
  remove: (id) => {
    remove(`walk-${id}.json`);
    const walks = get().walks.filter((x) => x.id !== id);
    writeJson('index.json', walks);
    set({ walks });
  },
  saveRoute: (r) => {
    get().load();
    const routes = [r, ...get().routes.filter((x) => x.id !== r.id)];
    writeJson('routes.json', routes);
    set({ routes });
  },
  removeRoute: (id) => {
    const routes = get().routes.filter((x) => x.id !== id);
    writeJson('routes.json', routes);
    set({ routes });
  },
  setPrefs: (p) => {
    get().load();
    const prefs = { ...get().prefs, ...p };
    writeJson('prefs.json', prefs);
    set({ prefs });
  },
}));

/** The walk in progress, written every few seconds so a crash or a killed app loses almost nothing. */
export const activeWalk = {
  read: <T>() => readJson<T | null>('active.json', null),
  write: (state: unknown) => {
    try {
      writeJson('active.json', state);
    } catch {
      // disk full or similar: recording carries on in memory
    }
  },
  clear: () => remove('active.json'),
};

/** Removes the signed-in account's walks and routes from this phone (account deletion). */
export function wipeWalks() {
  try {
    const d = dir();
    if (d.exists) d.delete();
  } catch {
    // nothing to remove
  }
  useWalks.setState({ walks: [], routes: [], prefs: DEFAULT_PREFS, loaded: null });
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
