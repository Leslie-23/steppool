// Walking routes from a self-hosted OSRM router (Ghana footpaths): directions to a place, suggested loops,
// and snapping a recorded trace onto real paths. Coordinates pass through and are never stored.
import { Router } from 'express';
import { z } from 'zod';

import { cumulative, distanceM, type Maneuver, type PlannedRoute } from '../../shared/walk.js';

import { limit, requireUser } from './auth.js';
import { config } from './config.js';
import { HttpError } from './errors.js';

type LngLat = [number, number];
interface OsrmStep { distance: number; name?: string; maneuver: { type: string; modifier?: string; location: LngLat } }
interface OsrmRoute { distance: number; duration: number; geometry: { coordinates: LngLat[] }; legs: { steps: OsrmStep[] }[] }

const Coord = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

async function osrm<T>(path: string): Promise<T> {
  if (!config.osrmFootUrl) throw new HttpError(503, "Directions aren't available right now");
  let res: Response;
  try {
    res = await fetch(`${config.osrmFootUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new HttpError(503, "Directions aren't available right now");
  }
  const body = (await res.json().catch(() => null)) as (T & { code?: string }) | null;
  if (!body || body.code !== 'Ok') {
    // NoRoute / NoSegment / NoMatch: outside the mapped area, or nowhere walkable nearby.
    if (body?.code && /^No/.test(body.code)) throw new HttpError(404, "We couldn't find a walking route there");
    throw new HttpError(503, "Directions aren't available right now");
  }
  return body;
}

const path = (coords: LngLat[]) => coords.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');

/** A short instruction a walker can take in at a glance, from OSRM's maneuver. */
export function instruction(step: OsrmStep): { text: string; kind: string } {
  const { type, modifier } = step.maneuver;
  const street = step.name?.trim();
  const onto = street ? ` onto ${street}` : '';
  if (type === 'arrive') return { text: 'You have arrived', kind: 'arrive' };
  if (type === 'depart') return { text: street ? `Start along ${street}` : 'Start walking', kind: 'depart' };
  if (type === 'roundabout' || type === 'rotary') return { text: `Go round the roundabout${onto}`, kind: 'roundabout' };
  if (modifier === 'uturn') return { text: 'Turn around', kind: 'uturn' };
  if (!modifier || modifier === 'straight') return { text: street ? `Continue on ${street}` : 'Continue straight', kind: 'straight' };
  const verb = modifier.startsWith('slight') ? 'Bear' : modifier.startsWith('sharp') ? 'Turn sharp' : type === 'fork' ? 'Keep' : 'Turn';
  const side = modifier.endsWith('left') ? 'left' : 'right';
  return { text: `${verb} ${side}${onto}`, kind: modifier };
}

export function toPlanned(r: OsrmRoute): PlannedRoute {
  const maneuvers: Maneuver[] = [];
  let at = 0;
  const steps = r.legs.flatMap((l) => l.steps);
  steps.forEach((s, i) => {
    const last = i === steps.length - 1;
    // Intermediate waypoints of a loop "arrive" and "depart" mid-route; only the real ends matter to the walker.
    const skip = (s.maneuver.type === 'arrive' && !last) || (s.maneuver.type === 'depart' && i > 0);
    if (!skip) {
      const { text, kind } = instruction(s);
      const prev = maneuvers[maneuvers.length - 1];
      // "Continue on X" straight after a turn onto X adds nothing.
      if (!(kind === 'straight' && prev && prev.street === (s.name?.trim() || undefined))) maneuvers.push({ at: Math.round(at), text, kind, street: s.name?.trim() || undefined });
    }
    at += s.distance;
  });
  return { coords: r.geometry.coordinates, distance: Math.round(r.distance), duration: Math.round(r.duration), maneuvers };
}

const route = async (coords: LngLat[]) => toPlanned((await osrm<{ routes: OsrmRoute[] }>(`/route/v1/foot/${path(coords)}?steps=true&geometries=geojson&overview=full&continue_straight=false`)).routes[0]);

/** A point `metres` away from `from` on compass bearing `deg`. */
function offset(from: LngLat, metres: number, deg: number): LngLat {
  const br = (deg * Math.PI) / 180;
  const dLat = (metres * Math.cos(br)) / 111_195;
  const dLng = (metres * Math.sin(br)) / (111_195 * Math.cos((from[1] * Math.PI) / 180));
  return [from[0] + dLng, from[1] + dLat];
}

/**
 * A loop of roughly `target` metres that starts and ends at `from`: a triangle out and back, snapped to
 * real paths, resized once if the paths made it much longer or shorter than asked. `seed` turns it to
 * face another direction for a different suggestion.
 */
export async function loop(from: LngLat, target: number, seed: number): Promise<PlannedRoute> {
  const heading = (seed * 67) % 360;
  let side = target / 3.6; // streets wander: the walked triangle is longer than its straight sides
  let best: PlannedRoute | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await route([from, offset(from, side, heading), offset(from, side, heading + 60), from]);
    if (!best || Math.abs(r.distance - target) < Math.abs(best.distance - target)) best = r;
    if (Math.abs(r.distance - target) / target <= 0.12) break;
    side = Math.min(target, Math.max(60, side * (target / Math.max(r.distance, 1))));
  }
  return best!;
}

interface OsrmMatch { matchings: { distance: number; geometry: { coordinates: LngLat[] } }[]; tracepoints: (unknown | null)[] }

/** Snaps a recorded trace onto paths. Returns null when too little of it sits on mapped paths to trust. */
export async function snap(points: { lng: number; lat: number; t: number; acc?: number }[]): Promise<{ coords: LngLat[]; distance: number } | null> {
  const coords: LngLat[] = [];
  let distance = 0;
  let matched = 0;
  const CHUNK = 90; // under OSRM's default limit of 100 per request
  for (let i = 0; i < points.length; i += CHUNK - 1) {
    const part = points.slice(i, i + CHUNK);
    if (part.length < 2) break;
    const radiuses = part.map((p) => Math.round(Math.min(40, Math.max(8, p.acc ?? 15)))).join(';');
    const stamps = part.map((p) => Math.round(p.t / 1000)).join(';');
    let m: OsrmMatch;
    try {
      m = await osrm<OsrmMatch>(`/match/v1/foot/${path(part.map((p) => [p.lng, p.lat]))}?geometries=geojson&overview=full&radiuses=${radiuses}&timestamps=${stamps}&gaps=ignore&tidy=true`);
    } catch (e) {
      if ((e as HttpError).status === 404) return null;
      throw e;
    }
    matched += m.tracepoints.filter(Boolean).length;
    for (const g of m.matchings) {
      distance += g.distance;
      coords.push(...g.geometry.coordinates);
    }
  }
  if (matched / points.length < 0.8 || coords.length < 2) return null;
  // Park paths and open ground aren't on the map; a snap that changes the length a lot is wrong, not better.
  const raw = cumulative(points.map((p) => [p.lng, p.lat] as LngLat)).at(-1) ?? 0;
  if (raw > 0 && Math.abs(distance - raw) / raw > 0.25) return null;
  return { coords, distance: Math.round(distance) };
}

export const routesRouter = Router();
routesRouter.use(requireUser);

routesRouter.post('/directions', async (req, res) => {
  await limit(`routes:${req.userId}`, 120, 3600);
  const { from, to } = z.object({ from: Coord, to: Coord }).parse(req.body);
  if (distanceM({ lng: from[0], lat: from[1] }, { lng: to[0], lat: to[1] }) > 60_000) throw new HttpError(400, 'That is too far to walk');
  res.json(await route([from, to]));
});

routesRouter.post('/loop', async (req, res) => {
  await limit(`routes:${req.userId}`, 120, 3600);
  const { from, distance, seed } = z.object({ from: Coord, distance: z.number().min(500).max(30_000), seed: z.number().int().min(0).max(1000).default(0) }).parse(req.body);
  res.json(await loop(from, distance, seed));
});

routesRouter.post('/snap', async (req, res) => {
  await limit(`snap:${req.userId}`, 60, 3600);
  const { points } = z.object({ points: z.array(z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), t: z.number(), acc: z.number().optional() })).min(2).max(2000) }).parse(req.body);
  res.json({ snapped: await snap(points) });
});
