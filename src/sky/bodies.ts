import { toHorizontal, type Observer } from "@/astro/coords";
import { locate, type Satellite } from "@/astro/satellites";
import { moon, moonParallax, PLANETS, planet, sun } from "@/astro/solar";
import { julianDay } from "@/astro/time";
import { enuVector } from "./engine";

// The things that move against the stars, placed for one moment. Unlike
// stars they're positioned in the horizontal frame directly (the Moon
// needs parallax, satellites come out of SGP4 that way), so the renderer
// draws them with the device matrix alone.

export type BodyKind = "sun" | "moon" | "planet" | "satellite";

export interface LiveBody {
  id: string;
  name: string;
  kind: BodyKind;
  x: number; // East-North-Up unit vector
  y: number;
  z: number;
  alt: number;
  az: number;
  mag: number;
  /** Moon only: lit fraction and whether it's growing. */
  illumination?: number;
  waxing?: boolean;
  /** Satellites: in sunlight (visible at night). */
  sunlit?: boolean;
  /** Satellites: a few minutes of path ahead, as ENU triples. */
  path?: number[];
  distance?: number;
}

export const PLANET_NAMES: Record<string, string> = {
  mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune",
};

export function bodiesAt(date: Date, obs: Observer, satellites: Satellite[]): LiveBody[] {
  const jd = julianDay(date);
  const out: LiveBody[] = [];
  const place = (id: string, name: string, kind: BodyKind, alt: number, az: number, mag: number, extra: Partial<LiveBody> = {}) => {
    const [x, y, z] = enuVector(alt, az);
    out.push({ id, name, kind, x, y, z, alt, az, mag, ...extra });
  };

  const s = sun(jd);
  const sh = toHorizontal(s, obs, jd);
  place("sun", "Sun", "sun", sh.alt, sh.az, s.mag, { distance: s.distance });

  const m = moon(jd);
  const mh = toHorizontal(m, obs, jd);
  place("moon", "Moon", "moon", moonParallax(mh.alt, m.distance), mh.az, m.mag, {
    illumination: m.illumination,
    waxing: m.waxing,
    distance: m.distance,
  });

  for (const p of PLANETS) {
    const b = planet(p, jd);
    const h = toHorizontal(b, obs, jd);
    place(p, PLANET_NAMES[p]!, "planet", h.alt, h.az, b.mag, { distance: b.distance });
  }

  for (const sat of satellites) {
    const now = locate(sat, obs, date);
    if (!now) continue;
    const path: number[] = [];
    for (let k = 1; k <= 6; k++) {
      const ahead = locate(sat, obs, new Date(date.getTime() + k * 30_000));
      if (ahead) path.push(...enuVector(ahead.alt, ahead.az));
    }
    place(`sat-${sat.id}`, sat.name, "satellite", now.alt, now.az, now.sunlit ? -1 : 9, { sunlit: now.sunlit, path, distance: now.rangeKm });
  }
  return out;
}
