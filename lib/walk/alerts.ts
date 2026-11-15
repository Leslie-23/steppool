// What the walker hears and sees along the way: kilometre updates, turns, records and the finish summary.
// Every kind can be switched off, and nothing repeats: each alert fires once per thing it describes.
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { fmtDistanceShort, fmtDuration, fmtKm, fmtPace, sayDuration, type RouteProgress, type TrackEvent, type WalkStats } from '@/shared/walk';

import type { WalkPrefs } from './types';

const CHANNEL = 'walk-alerts';
let channelReady = false;

async function notify(id: string, title: string, body: string) {
  try {
    if (Platform.OS === 'android' && !channelReady) {
      channelReady = true;
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Walk alerts', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#D7FF3A' });
    }
    // One id per kind: a new kilometre replaces the last one instead of stacking up a pile.
    await Notifications.scheduleNotificationAsync({ identifier: id, content: { title, body, data: { walk: '1' } }, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });
  } catch {
    // Notifications not allowed: the walk carries on silently.
  }
}

function say(text: string) {
  try {
    Speech.speak(text, { rate: Platform.OS === 'ios' ? 0.52 : 1, pitch: 1 });
  } catch {
    // no speech engine available
  }
}

const sayPace = (secPerKm: number | null) => (secPerKm ? `${sayDuration(secPerKm * 1000)} per kilometre` : '');

/** Turn-by-turn state, so each instruction is spoken once on approach and "off route" once per excursion. */
let spokenAt = -1;
let wasOff = false;
let arrived = false;

export function resetAlerts() {
  spokenAt = -1;
  wasOff = false;
  arrived = false;
  Speech.stop().catch(() => {});
}

export function onTrackEvent(e: TrackEvent, stats: WalkStats, prefs: WalkPrefs) {
  if (e.type === 'km') {
    const fastest = e.fastest && prefs.records;
    if (prefs.kmAlerts) notify('walk-km', `Kilometre ${e.km} · ${fmtDuration(e.ms)}${fastest ? ' · your fastest' : ''}`, `${fmtDuration(stats.movingMs)} so far · average ${fmtPace(stats.pace)} /km`);
    if (prefs.voice) say(`Kilometre ${e.km}. ${sayDuration(e.ms)}.${fastest ? ' Your fastest kilometre so far.' : ''} Average pace ${sayPace(stats.pace)}.`);
  } else if (e.type === 'gps-weak') {
    notify('walk-gps', 'GPS signal is weak', 'Distance may be less accurate until the signal returns. Open sky helps.');
  } else if (e.type === 'gps-ok') {
    Notifications.dismissNotificationAsync('walk-gps').catch(() => {});
  }
}

/** Speaks the next turn as it approaches, and says once when the walker leaves or finishes the route. */
export function onRouteProgress(p: RouteProgress, prefs: WalkPrefs) {
  if (!prefs.voice) return;
  if (p.arrived && !arrived) {
    arrived = true;
    say('You have arrived.');
    return;
  }
  if (p.offRoute !== wasOff) {
    wasOff = p.offRoute;
    if (p.offRoute) say("You're off the route.");
    return;
  }
  if (p.next && p.next.kind !== 'arrive' && p.toNext <= 45 && spokenAt !== p.next.at) {
    spokenAt = p.next.at;
    say(p.toNext > 15 ? `In ${fmtDistanceShort(p.toNext).replace(' m', ' metres')}, ${p.next.text.charAt(0).toLowerCase()}${p.next.text.slice(1)}.` : `${p.next.text}.`);
  }
}

export function onFinish(stats: WalkStats, records: string[], prefs: WalkPrefs) {
  Notifications.dismissNotificationAsync('walk-km').catch(() => {});
  Notifications.dismissNotificationAsync('walk-gps').catch(() => {});
  const best = prefs.records && records.length ? ` · ${records.join(', ')}` : '';
  notify('walk-done', `Walk saved · ${fmtKm(stats.distance)} km`, `${fmtDuration(stats.movingMs)} · ${fmtPace(stats.pace)} /km${stats.steps ? ` · ${stats.steps.toLocaleString()} steps` : ''}${best}`);
  if (prefs.voice) say(`Walk complete. ${fmtKm(stats.distance, 1)} kilometres in ${sayDuration(stats.movingMs)}.${prefs.records && records.length ? ` ${records.join('. ')}.` : ''}`);
}
