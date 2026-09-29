import { toHorizontal, type Equatorial, type Observer } from "./coords";
import { moon, moonParallax, sun } from "./solar";
import { julianDay } from "./time";

// Rising, setting and twilight: found by stepping through the day and
// bisecting each crossing of the altitude that counts.

export type AltitudeFn = (jd: number) => number;

/** Standard altitudes of the centre at rising (Meeus ch. 15). */
export const H0 = {
  star: -0.5667,
  sun: -0.8333,
  moon: 0.125,
  civil: -6,
  nautical: -12,
  astronomical: -18,
};

export function altitudeOf(position: (jd: number) => Equatorial, obs: Observer): AltitudeFn {
  return (jd) => toHorizontal(position(jd), obs, jd).alt;
}

export const sunAltitude = (obs: Observer): AltitudeFn => altitudeOf(sun, obs);

export const moonAltitude = (obs: Observer): AltitudeFn => (jd) => {
  const m = moon(jd);
  return moonParallax(toHorizontal(m, obs, jd).alt, m.distance);
};

export interface Crossing {
  jd: number;
  rising: boolean;
}

/** Every time the altitude crosses h between two Julian days. */
export function crossings(alt: AltitudeFn, h: number, from: number, to: number, stepMinutes = 10): Crossing[] {
  const step = stepMinutes / 1440;
  const out: Crossing[] = [];
  let t0 = from;
  let a0 = alt(t0) - h;
  while (t0 < to) {
    const t1 = Math.min(to, t0 + step);
    const a1 = alt(t1) - h;
    if (a0 === 0 || a0 * a1 < 0) {
      let lo = t0;
      let hi = t1;
      let alo = a0;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const am = alt(mid) - h;
        if (alo * am <= 0) hi = mid;
        else {
          lo = mid;
          alo = am;
        }
      }
      out.push({ jd: (lo + hi) / 2, rising: a1 > a0 });
    }
    t0 = t1;
    a0 = a1;
  }
  return out;
}

/** The highest point between two days: time and altitude. */
export function culmination(alt: AltitudeFn, from: number, to: number): { jd: number; alt: number } {
  let best = { jd: from, alt: -90 };
  for (let t = from; t <= to; t += 5 / 1440) {
    const a = alt(t);
    if (a > best.alt) best = { jd: t, alt: a };
  }
  // Golden-section refine around the best sample.
  let lo = best.jd - 5 / 1440;
  let hi = best.jd + 5 / 1440;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (alt(m1) < alt(m2)) lo = m1;
    else hi = m2;
  }
  const jd = (lo + hi) / 2;
  return { jd, alt: alt(jd) };
}

export function jdToDate(jd: number): Date {
  return new Date((jd - 2_440_587.5) * 86_400_000);
}

export interface Night {
  sunset: Date | null;
  darkFrom: Date | null; // end of astronomical twilight
  darkTo: Date | null; // start of the next morning's twilight
  sunrise: Date | null;
  /** True where the Sun never gets 18° below the horizon (summer at high latitudes). */
  neverDark: boolean;
}

/**
 * Tonight, starting from a moment: the next sunset, the dark hours between
 * astronomical twilights, and the next sunrise. If it is already night,
 * tonight is the night in progress.
 */
export function night(obs: Observer, at: Date): Night {
  const alt = sunAltitude(obs);
  const now = julianDay(at);
  const start = alt(now) < H0.sun ? now - 0.6 : now;
  const setTimes = crossings(alt, H0.sun, start, start + 1.5).filter((c) => !c.rising);
  const sunset = setTimes[0]?.jd ?? null;
  const base = sunset ?? now;
  const rise = crossings(alt, H0.sun, base, base + 1).find((c) => c.rising)?.jd ?? null;
  const dark = crossings(alt, H0.astronomical, base, rise ?? base + 1);
  const darkFrom = dark.find((c) => !c.rising)?.jd ?? null;
  const darkTo = dark.find((c) => c.rising)?.jd ?? null;
  return {
    sunset: sunset ? jdToDate(sunset) : null,
    sunrise: rise ? jdToDate(rise) : null,
    darkFrom: darkFrom ? jdToDate(darkFrom) : null,
    darkTo: darkTo ? jdToDate(darkTo) : null,
    neverDark: darkFrom === null && alt(base + 0.25) > H0.astronomical,
  };
}

/** A friendly name for the Moon's phase. */
export function phaseName(illumination: number, waxing: boolean): string {
  if (illumination < 0.03) return "New moon";
  if (illumination > 0.97) return "Full moon";
  if (Math.abs(illumination - 0.5) < 0.06) return waxing ? "First quarter" : "Last quarter";
  if (illumination < 0.5) return waxing ? "Waxing crescent" : "Waning crescent";
  return waxing ? "Waxing gibbous" : "Waning gibbous";
}
