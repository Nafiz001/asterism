import { eclipticToEquatorial, obliquity, precess, type Equatorial } from "./coords";
import { centuries, DEG, norm180, norm360, RAD } from "./time";

// The Sun, the Moon and the planets.

export interface Body extends Equatorial {
  /** Distance from the Earth: au for the Sun and planets, km for the Moon. */
  distance: number;
  /** Visual magnitude: smaller is brighter. */
  mag: number;
}

/** The Sun's apparent position (Meeus ch. 25, accurate to about 0.01°). */
export function sun(jd: number): Body & { longitude: number } {
  const t = centuries(jd);
  const L0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const M = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * DEG;
  const C =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(M) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const trueLong = L0 + C;
  const e = 0.016708634 - 0.000042037 * t;
  const nu = M + C * DEG;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu));
  const omega = (125.04 - 1934.136 * t) * DEG;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega);
  // Apparent: the obliquity nods with the Moon's node.
  const eps = (obliquity(jd) + 0.00256 * Math.cos(omega)) * DEG;
  const l = lambda * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(l), Math.cos(l));
  const dec = Math.asin(Math.sin(eps) * Math.sin(l));
  return { ra: norm360(ra * RAD), dec: dec * RAD, distance: R, mag: -26.74, longitude: norm360(lambda) };
}

// The Moon: the main periodic terms of Meeus ch. 47 (from Chapront's
// ELP-2000/82). Each row: multiples of D, M, M', F; then the longitude term
// (1e-6 degrees) and the distance term (1e-3 km).
const LR: [number, number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
];

// Latitude terms (1e-6 degrees).
const B: [number, number, number, number, number][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
];

export interface MoonBody extends Body {
  /** Fraction of the disc that is lit, 0..1. */
  illumination: number;
  /** True while the Moon is growing towards full. */
  waxing: boolean;
  /** Ecliptic longitude and latitude, degrees. */
  longitude: number;
  latitude: number;
}

/** The Moon's geocentric position, distance and phase (accurate to ~0.05°). */
export function moon(jd: number): MoonBody {
  const t = centuries(jd);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const Lp = norm360(218.3164477 + 481267.88123421 * t - 0.0015786 * t2 + t3 / 538841 - t4 / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * t - 0.0018819 * t2 + t3 / 545868 - t4 / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * t - 0.0001536 * t2 + t3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * t + 0.0087414 * t2 + t3 / 69699 - t4 / 14712000);
  const F = norm360(93.272095 + 483202.0175233 * t - 0.0036539 * t2 - t3 / 3526000 + t4 / 863310000);
  const A1 = (119.75 + 131.849 * t) * DEG;
  const A2 = (53.09 + 479264.29 * t) * DEG;
  const A3 = (313.45 + 481266.484 * t) * DEG;
  const E = 1 - 0.002516 * t - 0.0000074 * t2;

  let sl = 0;
  let sr = 0;
  for (const [d, m, mp, f, l, r] of LR) {
    const arg = (d * D + m * M + mp * Mp + f * F) * DEG;
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sl += l * e * Math.sin(arg);
    sr += r * e * Math.cos(arg);
  }
  let sb = 0;
  for (const [d, m, mp, f, b] of B) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sb += b * e * Math.sin((d * D + m * M + mp * Mp + f * F) * DEG);
  }
  sl += 3958 * Math.sin(A1) + 1962 * Math.sin((Lp - F) * DEG) + 318 * Math.sin(A2);
  sb +=
    -2235 * Math.sin(Lp * DEG) +
    382 * Math.sin(A3) +
    175 * Math.sin(A1 - F * DEG) +
    175 * Math.sin(A1 + F * DEG) +
    127 * Math.sin((Lp - Mp) * DEG) -
    115 * Math.sin((Lp + Mp) * DEG);

  const lambda = norm360(Lp + sl / 1e6);
  const beta = sb / 1e6;
  const distance = 385000.56 + sr / 1000;
  const eq = eclipticToEquatorial(lambda, beta, jd);

  // Phase angle (Meeus 48.4).
  const i =
    180 -
    D -
    6.289 * Math.sin(Mp * DEG) +
    2.1 * Math.sin(M * DEG) -
    1.274 * Math.sin((2 * D - Mp) * DEG) -
    0.658 * Math.sin(2 * D * DEG) -
    0.214 * Math.sin(2 * Mp * DEG) -
    0.11 * Math.sin(D * DEG);
  const illumination = (1 + Math.cos(i * DEG)) / 2;
  const waxing = norm180(lambda - sun(jd).longitude) > 0;
  // Brightness from the phase angle (Allen), about -12.7 at full.
  const pa = Math.abs(norm180(i));
  const mag = -12.73 + 0.026 * pa + 4e-9 * pa ** 4;
  return { ...eq, distance, mag, illumination, waxing, longitude: lambda, latitude: beta };
}

// The planets: Keplerian elements and their rates per century, valid
// 1800-2050 (E. M. Standish, JPL, "Keplerian Elements for Approximate
// Positions of the Major Planets", table 1). Accurate to a few arcminutes,
// far finer than a phone's compass.
//   a (au), e, I, L, long. of perihelion, long. of node (degrees)
type Elements = [number, number, number, number, number, number];
const ELEMENTS: Record<string, [Elements, Elements]> = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};

export const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"] as const;
export type PlanetName = (typeof PLANETS)[number];

/** A planet's position in the J2000 ecliptic frame, au from the Sun. */
function heliocentric(name: string, t: number): [number, number, number] {
  const [el, rate] = ELEMENTS[name]!;
  const [a, e, I, L, w, N] = el.map((v, i) => v + rate[i]! * t) as Elements;
  const omega = (w - N) * DEG;
  const node = N * DEG;
  const inc = I * DEG;
  const M = norm180(L - w) * DEG;
  // Kepler's equation, by Newton's method.
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(omega), so = Math.sin(omega);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc);
  return [
    (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
    (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
    so * si * xp + co * si * yp,
  ];
}

const J2000_OBLIQUITY = 23.43928 * DEG;

const MAG: Record<PlanetName, (i: number) => number> = {
  mercury: (i) => -0.42 + 0.038 * i - 0.000273 * i * i + 0.000002 * i ** 3,
  venus: (i) => -4.4 + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3,
  mars: (i) => -1.52 + 0.016 * i,
  jupiter: (i) => -9.4 + 0.005 * i,
  saturn: () => -8.88,
  uranus: () => -7.19,
  neptune: () => -6.87,
};

/** A planet's geocentric position (of date), distance and brightness. */
export function planet(name: PlanetName, jd: number): Body {
  const t = centuries(jd);
  const p = heliocentric(name, t);
  const earth = heliocentric("earth", t);
  const g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
  const x = g[0]!;
  const y = Math.cos(J2000_OBLIQUITY) * g[1]! - Math.sin(J2000_OBLIQUITY) * g[2]!;
  const z = Math.sin(J2000_OBLIQUITY) * g[1]! + Math.cos(J2000_OBLIQUITY) * g[2]!;
  const delta = Math.hypot(x, y, z);
  const j2000 = { ra: norm360(Math.atan2(y, x) * RAD), dec: Math.atan2(z, Math.hypot(x, y)) * RAD };
  const r = Math.hypot(...p);
  const R = Math.hypot(...earth);
  const phase = Math.acos(Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta)))) * RAD;
  return { ...precess(j2000, jd), distance: delta, mag: 5 * Math.log10(r * delta) + MAG[name](phase) };
}

/**
 * Shifts the Moon from where the Earth's centre sees it to where an
 * observer on the surface does: up to a degree lower near the horizon.
 */
export function moonParallax(altitude: number, distanceKm: number): number {
  const p = Math.asin(6378.14 / distanceKm) * RAD;
  return altitude - p * Math.cos(altitude * DEG);
}
