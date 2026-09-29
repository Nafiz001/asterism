// Time scales. Everything downstream works in Julian days: a continuous
// count of days since noon, 1 January 4713 BC, which makes differences
// between dates plain subtraction.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Julian day for a JavaScript date (UTC). */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Julian centuries since J2000.0, the epoch the catalogues use. */
export function centuries(jd: number): number {
  return (jd - 2_451_545.0) / 36_525;
}

/** Reduces an angle in degrees to 0..360. */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Reduces an angle in degrees to -180..180. */
export function norm180(deg: number): number {
  const r = norm360(deg);
  return r > 180 ? r - 360 : r;
}

/**
 * Greenwich mean sidereal time, in degrees (Meeus, eq. 12.4): how far the
 * sky has turned, measured on the stars rather than the Sun.
 */
export function gmst(jd: number): number {
  const t = centuries(jd);
  return norm360(280.46061837 + 360.98564736629 * (jd - 2_451_545.0) + 0.000387933 * t * t - (t * t * t) / 38_710_000);
}

/** Local sidereal time in degrees for an east-positive longitude. */
export function lst(jd: number, longitude: number): number {
  return norm360(gmst(jd) + longitude);
}
