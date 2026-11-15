import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.OSRM_FOOT_URL = 'http://osrm.test:5000';
});

const { buildApp } = await import('../src/app.js');
const { connectDb } = await import('../src/models.js');
const { redis } = await import('../src/redis.js');
const { instruction, toPlanned } = await import('../src/routing.js');

let repl: MongoMemoryReplSet;
let app: ReturnType<typeof buildApp>;
let auth: Record<string, string>;
const realFetch = globalThis.fetch;
/** Requests the fake OSRM received, and the response it should give for each kind. */
const calls: string[] = [];
let osrm: (url: string) => unknown = () => ({ code: 'NoRoute' });

const step = (type: string, modifier: string | undefined, name: string, distance: number) => ({ distance, name, maneuver: { type, modifier, location: [0, 0] as [number, number] } });
const sampleRoute = (distance: number, coords: [number, number][] = [[-0.19, 5.55], [-0.189, 5.556], [-0.187, 5.56]]) => ({
  distance,
  duration: distance / 1.4,
  geometry: { coordinates: coords },
  legs: [{ steps: [step('depart', 'right', 'Egypt Lane', distance * 0.4), step('turn', 'left', 'Oxford Street', distance * 0.6), step('arrive', undefined, 'Oxford Street', 0)] }],
});

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('http://osrm.test')) return realFetch(url as string, init);
    calls.push(u);
    return new Response(JSON.stringify(osrm(u)), { headers: { 'content-type': 'application/json' } });
  });
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : undefined });
  await connectDb(repl.getUri('steppool-routing-test'));
  await redis().flushdb();
  app = buildApp();
  const { body: otp } = await request(app).post('/auth/otp').send({ email: 'router@example.com' }).expect(200);
  const { body } = await request(app).post('/auth/verify').send({ email: 'router@example.com', code: otp.devCode }).expect(200);
  auth = { authorization: `Bearer ${body.tokens.access}` };
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await mongoose.disconnect();
  await repl?.stop();
  redis().disconnect();
});

describe('instructions', () => {
  it('reads like something you can follow at a glance', () => {
    expect(instruction(step('turn', 'left', 'Oxford Street', 10)).text).toBe('Turn left onto Oxford Street');
    expect(instruction(step('turn', 'slight right', '', 10)).text).toBe('Bear right');
    expect(instruction(step('turn', 'sharp left', 'Ring Road', 10)).text).toBe('Turn sharp left onto Ring Road');
    expect(instruction(step('new name', 'straight', 'Haile Selassie Road', 10)).text).toBe('Continue on Haile Selassie Road');
    expect(instruction(step('continue', 'uturn', 'X', 10)).text).toBe('Turn around');
    expect(instruction(step('depart', 'right', 'Egypt Lane', 10)).text).toBe('Start along Egypt Lane');
    expect(instruction(step('arrive', undefined, '', 0))).toEqual({ text: 'You have arrived', kind: 'arrive' });
  });

  it('places each instruction along the route and drops mid-loop arrivals and repeats', () => {
    const r = toPlanned({
      distance: 1000,
      duration: 700,
      geometry: { coordinates: [[0, 0], [0, 1]] },
      legs: [
        { steps: [step('depart', 'left', 'A St', 200), step('turn', 'right', 'B St', 300), step('arrive', undefined, 'B St', 0)] },
        { steps: [step('depart', 'left', 'B St', 100), step('new name', 'straight', 'B St', 150), step('turn', 'left', 'C St', 250), step('arrive', undefined, 'C St', 0)] },
      ],
    } as never);
    expect(r.maneuvers.map((m) => [m.at, m.text])).toEqual([[0, 'Start along A St'], [200, 'Turn right onto B St'], [750, 'Turn left onto C St'], [1000, 'You have arrived']]);
  });
});

describe('routes API', () => {
  it('needs a signed-in user', async () => {
    await request(app).post('/routes/directions').send({ from: [-0.19, 5.55], to: [-0.18, 5.56] }).expect(401);
  });

  it('returns directions with the line, length and turns', async () => {
    osrm = () => ({ code: 'Ok', routes: [sampleRoute(1880)] });
    const { body } = await request(app).post('/routes/directions').set(auth).send({ from: [-0.1969, 5.556], to: [-0.187, 5.565] }).expect(200);
    expect(body).toMatchObject({ distance: 1880, coords: [[-0.19, 5.55], [-0.189, 5.556], [-0.187, 5.56]] });
    expect(body.maneuvers.map((m: { text: string }) => m.text)).toEqual(['Start along Egypt Lane', 'Turn left onto Oxford Street', 'You have arrived']);
    expect(calls.at(-1)).toContain('/route/v1/foot/-0.196900,5.556000;-0.187000,5.565000?steps=true');
  });

  it('says so plainly when there is no walkable route, the place is too far, or the router is down', async () => {
    osrm = () => ({ code: 'NoRoute' });
    expect((await request(app).post('/routes/directions').set(auth).send({ from: [-0.19, 5.55], to: [-0.18, 5.56] }).expect(404)).body.error).toBe("We couldn't find a walking route there");
    expect((await request(app).post('/routes/directions').set(auth).send({ from: [-0.19, 5.55], to: [-1.6, 6.7] }).expect(400)).body.error).toBe('That is too far to walk');
    osrm = () => ({ message: 'boom' });
    await request(app).post('/routes/directions').set(auth).send({ from: [-0.19, 5.55], to: [-0.18, 5.56] }).expect(503);
  });

  it('suggests a loop near the asked length, resizing when the streets make it too long', async () => {
    const before = calls.length;
    // First attempt comes back 60% too long; the second, with smaller sides, is on target.
    let n = 0;
    osrm = () => ({ code: 'Ok', routes: [sampleRoute(n++ === 0 ? 4800 : 3100)] });
    const { body } = await request(app).post('/routes/loop').set(auth).send({ from: [-0.19, 5.55], distance: 3000, seed: 2 }).expect(200);
    expect(body.distance).toBe(3100);
    const urls = calls.slice(before);
    expect(urls).toHaveLength(2);
    // Out and back to the same point, via two waypoints.
    const pts = urls[0].split('/foot/')[1].split('?')[0].split(';');
    expect(pts).toHaveLength(4);
    expect(pts[0]).toBe(pts[3]);
    await request(app).post('/routes/loop').set(auth).send({ from: [-0.19, 5.55], distance: 100 }).expect(400);
  });

  it('snaps a recorded trace to paths, and declines when the match is poor or changes the length', async () => {
    const points = Array.from({ length: 40 }, (_, i) => ({ lng: -0.19, lat: 5.55 + i * 0.0001, t: 1_800_000_000_000 + i * 5000, acc: 6 })); // ~434 m north
    const line: [number, number][] = [[-0.19, 5.55], [-0.19, 5.5539]];
    osrm = () => ({ code: 'Ok', matchings: [{ distance: 440, geometry: { coordinates: line } }], tracepoints: points.map(() => ({})) });
    const ok = await request(app).post('/routes/snap').set(auth).send({ points }).expect(200);
    expect(ok.body.snapped).toEqual({ coords: line, distance: 440 });
    expect(calls.at(-1)).toContain('/match/v1/foot/');
    expect(calls.at(-1)).toContain('radiuses=8;8;');

    osrm = () => ({ code: 'Ok', matchings: [{ distance: 700, geometry: { coordinates: line } }], tracepoints: points.map(() => ({})) });
    expect((await request(app).post('/routes/snap').set(auth).send({ points }).expect(200)).body.snapped).toBeNull(); // 60% longer: a detour, not the walk
    osrm = () => ({ code: 'Ok', matchings: [{ distance: 440, geometry: { coordinates: line } }], tracepoints: points.map((_, i) => (i % 2 ? {} : null)) });
    expect((await request(app).post('/routes/snap').set(auth).send({ points }).expect(200)).body.snapped).toBeNull(); // half the fixes off the map
    osrm = () => ({ code: 'NoMatch' });
    expect((await request(app).post('/routes/snap').set(auth).send({ points }).expect(200)).body.snapped).toBeNull();
  });
});
