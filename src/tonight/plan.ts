import { toHorizontal, type Observer } from "@/astro/coords";
import { crossings, H0, jdToDate, moonAltitude, night, sunAltitude, type Night } from "@/astro/events";
import { passes, type Pass, type Satellite } from "@/astro/satellites";
import { moon, PLANETS, planet, type PlanetName } from "@/astro/solar";
import { julianDay } from "@/astro/time";
import type { HourForecast } from "@/state/data";

// Tonight, worked out: when it's dark, how much the Moon and the clouds
// spoil it, what's worth looking at and when.

export interface HourScore {
  at: Date;
  /** 0 (hopeless) to 1 (dark, clear, moonless). */
  score: number;
  darkness: number;
  cloud: number | null;
  moonUp: boolean;
}

export interface PlanetTonight {
  id: PlanetName;
  best: Date;
  alt: number;
  az: number;
  mag: number;
  /** "eye", "binoculars" or "telescope". */
  needs: "eye" | "binoculars" | "telescope";
}

export interface Tonight {
  night: Night;
  hours: HourScore[];
  best: { from: Date; to: Date } | null;
  moon: { illumination: number; waxing: boolean; rise: Date | null; set: Date | null };
  planets: PlanetTonight[];
  passes: Pass[];
}

/** How dark the sky is for a Sun altitude: 1 is truly dark. */
export function darkness(sunAlt: number): number {
  if (sunAlt <= -18) return 1;
  if (sunAlt <= -12) return 0.7;
  if (sunAlt <= -6) return 0.3;
  return 0;
}

export function scoreHour(sunAlt: number, cloud: number | null, moonAlt: number, moonLit: number): Omit<HourScore, "at"> {
  const d = darkness(sunAlt);
  const moonUp = moonAlt > 0;
  const moonPenalty = moonUp ? 0.55 * moonLit : 0;
  const clouds = cloud === null ? 0.3 : cloud / 100;
  return { score: d * (1 - clouds) * (1 - moonPenalty), darkness: d, cloud, moonUp };
}

export function planTonight(obs: Observer, now: Date, weather: HourForecast[] | null, sats: Satellite[]): Tonight {
  const n = night(obs, now);
  const start = n.sunset ?? now;
  const end = n.sunrise ?? new Date(start.getTime() + 12 * 3600_000);
  const sunAlt = sunAltitude(obs);
  const moonAlt = moonAltitude(obs);

  // Hour by hour, from sunset to sunrise.
  const hours: HourScore[] = [];
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  for (let t = first.getTime(); t <= end.getTime(); t += 3600_000) {
    const at = new Date(t);
    const jd = julianDay(at);
    const w = weather?.find((h) => Math.abs(new Date(h.time).getTime() - t) < 30 * 60_000);
    hours.push({ at, ...scoreHour(sunAlt(jd), w ? w.cloud : null, moonAlt(jd), moon(jd).illumination) });
  }

  // The longest run of good hours.
  let best: Tonight["best"] = null;
  let run: HourScore[] = [];
  const flush = () => {
    if (run.length && (!best || run.length > (best.to.getTime() - best.from.getTime()) / 3600_000)) {
      best = { from: run[0]!.at, to: new Date(run[run.length - 1]!.at.getTime() + 3600_000) };
    }
    run = [];
  };
  for (const h of hours) {
    if (h.score >= 0.45) run.push(h);
    else flush();
  }
  flush();

  const jd0 = julianDay(start);
  const jd1 = julianDay(end);
  const moonEvents = crossings(moonAlt, H0.moon, jd0 - 0.25, jd1 + 0.1, 10);
  const mid = moon((jd0 + jd1) / 2);

  const planets: PlanetTonight[] = [];
  for (const id of PLANETS) {
    let top: { jd: number; alt: number; az: number } | null = null;
    for (let jd = jd0; jd <= jd1; jd += 1 / 48) {
      if (sunAlt(jd) > -8) continue;
      const h = toHorizontal(planet(id, jd), obs, jd);
      if (!top || h.alt > top.alt) top = { jd, alt: h.alt, az: h.az };
    }
    if (!top || top.alt < 10) continue;
    const mag = planet(id, top.jd).mag;
    planets.push({ id, best: jdToDate(top.jd), alt: top.alt, az: top.az, mag, needs: mag < 5.5 ? "eye" : mag < 7.5 ? "binoculars" : "telescope" });
  }
  planets.sort((a, b) => a.mag - b.mag);

  const found = sats.flatMap((s) => passes(s, obs, now, 3)).filter((p) => p.visible && p.set.getTime() > now.getTime());
  found.sort((a, b) => a.rise.getTime() - b.rise.getTime());

  return {
    night: n,
    hours,
    best,
    moon: {
      illumination: mid.illumination,
      waxing: mid.waxing,
      rise: moonEvents.find((e) => e.rising) ? jdToDate(moonEvents.find((e) => e.rising)!.jd) : null,
      set: moonEvents.find((e) => !e.rising) ? jdToDate(moonEvents.find((e) => !e.rising)!.jd) : null,
    },
    planets,
    passes: found.slice(0, 8),
  };
}
