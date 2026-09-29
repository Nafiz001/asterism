// The sky, as the phone sees it. These run on the UI thread (they are
// worklets), once per frame.
//
// A star's direction is a unit vector in the equatorial frame, fixed on
// the sky. One 3x3 matrix, rebuilt each frame, carries it to the phone's
// own axes: the Earth's turn (sidereal time) and the observer's latitude
// take it to East-North-Up, and the phone's orientation takes it from
// there to the screen. Projecting a star is then nine multiplications and
// a division, with no trigonometry at all.

export type Mat3 = number[]; // row-major, 9 numbers

export const DEG = Math.PI / 180;

// Helpers come first: a worklet captures the functions it calls when it is
// defined, so anything it uses must already exist.

export function mul(a: Mat3, b: Mat3): Mat3 {
  "worklet";
  const o = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      o[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
    }
  }
  return o;
}

export function transpose(m: Mat3): Mat3 {
  "worklet";
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}


/** Greenwich mean sidereal time, degrees (Meeus 12.4). */
export function siderealDeg(jd: number): number {
  "worklet";
  const t = (jd - 2451545.0) / 36525;
  const g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t;
  return ((g % 360) + 360) % 360;
}

export function julianNow(ms: number): number {
  "worklet";
  return ms / 86400000 + 2440587.5;
}

/** Equatorial unit vector → East-North-Up, for a local sidereal time and latitude. */
export function equatorialToEnu(lstDeg: number, latDeg: number): Mat3 {
  "worklet";
  const t = lstDeg * DEG;
  const l = latDeg * DEG;
  const ct = Math.cos(t), st = Math.sin(t);
  const cl = Math.cos(l), sl = Math.sin(l);
  return [
    -st, ct, 0,
    -sl * ct, -sl * st, cl,
    cl * ct, cl * st, sl,
  ];
}

/**
 * The phone's orientation from Reanimated's rotation sensor, as a matrix
 * taking the phone's axes (x right, y up the screen, z out of it) into
 * East-North-Up. Reanimated reorders Android's rotation-vector quaternion
 * to match iOS: (qx, qy, qz) = (x, z, −y) of Android's, which rotates the
 * phone's frame into (East, North, Up). Undo that here.
 */
export function deviceToEnu(qx: number, qy: number, qz: number, qw: number): Mat3 {
  "worklet";
  const x = qx, y = -qz, z = qy, w = qw;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** A hand-held view looking at an azimuth and altitude, as the same kind of matrix. */
export function lookAt(azDeg: number, altDeg: number): Mat3 {
  "worklet";
  const a = azDeg * DEG, h = altDeg * DEG;
  const d = [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)];
  const X = [Math.cos(a), -Math.sin(a), 0]; // screen right, level
  const Z = [-d[0]!, -d[1]!, -d[2]!]; // the back camera looks along −z
  const Y = [Z[1]! * X[2]! - Z[2]! * X[1]!, Z[2]! * X[0]! - Z[0]! * X[2]!, Z[0]! * X[1]! - Z[1]! * X[0]!];
  // Columns X, Y, Z.
  return [X[0]!, Y[0]!, Z[0]!, X[1]!, Y[1]!, Z[1]!, X[2]!, Y[2]!, Z[2]!];
}

/** Turns East-North-Up about the vertical so north moves east by deg. */
export function turnNorth(m: Mat3, deg: number): Mat3 {
  "worklet";
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  const r = [c, s, 0, -s, c, 0, 0, 0, 1];
  return mul(r, m);
}

/** Where the camera points, as azimuth and altitude, from a device→ENU matrix. */
export function pointing(deviceToEnuM: Mat3): { az: number; alt: number } {
  "worklet";
  // The camera looks along the phone's −z axis: minus the third column.
  const e = -deviceToEnuM[2]!, n = -deviceToEnuM[5]!, u = -deviceToEnuM[8]!;
  return { az: ((Math.atan2(e, n) / DEG) % 360 + 360) % 360, alt: Math.asin(Math.max(-1, Math.min(1, u))) / DEG };
}

export interface Projector {
  /** Equatorial (or, with enu, horizontal) vector → phone axes. */
  m: Mat3;
  f: number;
  cx: number;
  cy: number;
}

/** Screen position of a vector in phone axes, or null behind the viewer. */
export function project(p: Projector, x: number, y: number, z: number, out: number[]): boolean {
  "worklet";
  const m = p.m;
  const dx = m[0]! * x + m[1]! * y + m[2]! * z;
  const dy = m[3]! * x + m[4]! * y + m[5]! * z;
  const dz = m[6]! * x + m[7]! * y + m[8]! * z;
  if (dz > -0.02) return false;
  out[0] = p.cx + (p.f * dx) / -dz;
  out[1] = p.cy - (p.f * dy) / -dz;
  return true;
}

/** Horizontal (altitude, azimuth) → East-North-Up unit vector. */
export function enuVector(altDeg: number, azDeg: number): [number, number, number] {
  "worklet";
  const a = altDeg * DEG, z = azDeg * DEG;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}

/** Equatorial (ra, dec) → unit vector. */
export function eqVector(raDeg: number, decDeg: number): [number, number, number] {
  "worklet";
  const r = raDeg * DEG, d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
}
