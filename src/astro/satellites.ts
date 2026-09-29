import * as sat from "satellite.js";
import type { Observer } from "./coords";
import { sun } from "./solar";
import { DEG, julianDay, RAD } from "./time";

// Satellites, from NORAD two-line element sets (published by CelesTrak),
// propagated with SGP4, the model NORAD itself uses.

export interface Tle {
  name: string;
  line1: string;
  line2: string;
}

export interface Satellite {
  name: string;
  id: string;
  rec: sat.SatRec;
}

export function parseTle(text: string): Tle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out: Tle[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (name && l1?.startsWith("1 ") && l2?.startsWith("2 ")) out.push({ name: name.trim(), line1: l1, line2: l2 });
  }
  return out;
}

export function toSatellite(t: Tle): Satellite | null {
  try {
    const rec = sat.twoline2satrec(t.line1, t.line2);
    if (rec.error) return null;
    return { name: t.name, id: t.line1.slice(2, 7).trim(), rec };
  } catch {
    return null;
  }
}

export interface SatPosition {
  alt: number;
  az: number;
  rangeKm: number;
  /** In sunlight, and so visible if the sky is dark enough. */
  sunlit: boolean;
}

const EARTH_RADIUS = 6371;

/** Where a satellite is in the observer's sky. */
export function locate(s: Satellite, obs: Observer, date: Date): SatPosition | null {
  const pv = sat.propagate(s.rec, date);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const gmst = sat.gstime(date);
  const ecf = sat.eciToEcf(pv.position, gmst);
  const look = sat.ecfToLookAngles({ latitude: obs.lat * DEG, longitude: obs.lon * DEG, height: 0.05 }, ecf);
  return {
    alt: look.elevation * RAD,
    az: look.azimuth * RAD,
    rangeKm: look.rangeSat,
    sunlit: sunlit(pv.position, date),
  };
}

/**
 * Whether a point in Earth-centred inertial space is outside the Earth's
 * shadow, treating the shadow as a cylinder (exact enough for low orbits).
 */
function sunlit(p: sat.EciVec3<number>, date: Date): boolean {
  const s = sun(julianDay(date));
  const ra = s.ra * DEG;
  const dec = s.dec * DEG;
  const dir = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const along = p.x * dir[0]! + p.y * dir[1]! + p.z * dir[2]!;
  if (along > 0) return true;
  const perp = Math.hypot(p.x - along * dir[0]!, p.y - along * dir[1]!, p.z - along * dir[2]!);
  return perp > EARTH_RADIUS;
}

export interface Pass {
  satellite: string;
  rise: Date;
  peak: Date;
  set: Date;
  maxAlt: number;
  riseAz: number;
  setAz: number;
  /** Sunlit while the observer's sky is dark: you can see it. */
  visible: boolean;
}

/**
 * Passes above minAlt in the next few days, by stepping 20 seconds at a
 * time. A pass is visible when the satellite is sunlit and the Sun is at
 * least 6° below the horizon for the observer.
 */
export function passes(s: Satellite, obs: Observer, from: Date, days = 3, minAlt = 10): Pass[] {
  const out: Pass[] = [];
  const step = 20_000;
  const end = from.getTime() + days * 86_400_000;
  let current: (Pass & { seenVisible: boolean }) | null = null;
  for (let t = from.getTime(); t < end; t += step) {
    const d = new Date(t);
    const p = locate(s, obs, d);
    if (!p) continue;
    if (p.alt >= minAlt) {
      const dark = sunAltitudeRough(obs, d) < -6;
      if (!current) {
        current = { satellite: s.name, rise: d, peak: d, set: d, maxAlt: p.alt, riseAz: p.az, setAz: p.az, visible: false, seenVisible: false };
      }
      if (p.alt > current.maxAlt) {
        current.maxAlt = p.alt;
        current.peak = d;
      }
      current.set = d;
      current.setAz = p.az;
      if (p.sunlit && dark) current.seenVisible = true;
    } else if (current) {
      const { seenVisible, ...pass } = current;
      out.push({ ...pass, visible: seenVisible });
      current = null;
    }
  }
  return out;
}

function sunAltitudeRough(obs: Observer, d: Date): number {
  const jd = julianDay(d);
  const s = sun(jd);
  const lst = (280.46061837 + 360.98564736629 * (jd - 2451545) + obs.lon) * DEG;
  const H = lst - s.ra * DEG;
  const phi = obs.lat * DEG;
  const dec = s.dec * DEG;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) * RAD;
}
