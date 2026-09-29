import { centuries, DEG, lst, norm360, RAD } from "./time";

// Coordinate systems.
//
// Equatorial (right ascension, declination) pins a star to the sky itself:
// it doesn't change as the Earth turns. Horizontal (altitude above the
// horizon, azimuth clockwise from north) is what you see from one place at
// one moment. The bridge between them is the local sidereal time and the
// observer's latitude.

export interface Equatorial {
  ra: number; // degrees
  dec: number; // degrees
}

export interface Horizontal {
  alt: number; // degrees above the horizon
  az: number; // degrees from north, through east
}

export interface Observer {
  lat: number;
  lon: number; // east positive
}

/** Obliquity of the ecliptic: the tilt of the Earth's axis (Meeus 22.2). */
export function obliquity(jd: number): number {
  const t = centuries(jd);
  return 23.439291111 - 0.0130041667 * t - 1.64e-7 * t * t + 5.04e-7 * t * t * t;
}

/** Ecliptic longitude and latitude to equatorial coordinates. */
export function eclipticToEquatorial(lambda: number, beta: number, jd: number): Equatorial {
  const e = obliquity(jd) * DEG;
  const l = lambda * DEG;
  const b = beta * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  return { ra: norm360(ra * RAD), dec: dec * RAD };
}

/**
 * Precesses J2000 coordinates to the given date (Meeus 21.2, rigorous
 * method). The Earth's axis wobbles through a 26,000-year circle, moving
 * catalogue positions by about a minute of arc every three years.
 */
export function precess(eq: Equatorial, jd: number): Equatorial {
  const t = centuries(jd);
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) / 3600;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) / 3600;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) / 3600;
  const ra = eq.ra * DEG;
  const dec = eq.dec * DEG;
  const A = Math.cos(dec) * Math.sin(ra + zeta * DEG);
  const B = Math.cos(theta * DEG) * Math.cos(dec) * Math.cos(ra + zeta * DEG) - Math.sin(theta * DEG) * Math.sin(dec);
  const C = Math.sin(theta * DEG) * Math.cos(dec) * Math.cos(ra + zeta * DEG) + Math.cos(theta * DEG) * Math.sin(dec);
  return { ra: norm360(Math.atan2(A, B) * RAD + z), dec: Math.asin(Math.max(-1, Math.min(1, C))) * RAD };
}

/** Equatorial to horizontal coordinates for an observer at a moment. */
export function toHorizontal(eq: Equatorial, obs: Observer, jd: number): Horizontal {
  const H = (lst(jd, obs.lon) - eq.ra) * DEG; // hour angle
  const phi = obs.lat * DEG;
  const d = eq.dec * DEG;
  const sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // Azimuth measured from north, clockwise (Meeus measures from south).
  const az = Math.atan2(-Math.sin(H), Math.tan(d) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { alt: alt * RAD, az: norm360(az * RAD) };
}

/**
 * Atmospheric refraction in degrees for an apparent altitude (Bennett's
 * formula, Meeus 16.4): the air lifts objects near the horizon by up to
 * half a degree, a whole Moon's width.
 */
export function refraction(alt: number): number {
  if (alt < -1) return 0;
  const r = 1 / Math.tan((alt + 7.31 / (alt + 4.4)) * DEG); // arcminutes
  return r / 60;
}

/** Angular distance between two points on the sphere, degrees. */
export function separation(a: Equatorial, b: Equatorial): number {
  const d1 = a.dec * DEG;
  const d2 = b.dec * DEG;
  const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos((a.ra - b.ra) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) * RAD;
}

/** Unit vector in the local East-North-Up frame for an altitude and azimuth. */
export function enu(h: Horizontal): [number, number, number] {
  const a = h.alt * DEG;
  const z = h.az * DEG;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}
