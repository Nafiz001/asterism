import { Skia } from "@shopify/react-native-skia";
import { precess } from "@/astro/coords";
import sky from "@/data/sky.json";
import { starColor } from "@/ui/theme";
import { eqVector } from "./engine";

// The fixed sky, prepared once: every star and constellation vertex as a
// unit vector precessed to today, in flat arrays a worklet can walk fast.

export interface Catalog {
  /** x, y, z per star, brightest first. */
  stars: number[];
  mag: number[];
  /** Skia colours, one per star, for the normal and the red palette. */
  colors: Float32Array[];
  redColors: Float32Array[];
  /** Proper names by star index. */
  names: Record<number, string>;
  /** Stick figures: flat x, y, z lists per line segment chain. */
  lines: number[][];
  /** Constellation labels: vector and name. */
  labels: { x: number; y: number; z: number; name: string; rank: number; id: string }[];
}

export interface StarInfo {
  index: number;
  name: string | null;
  ra: number;
  dec: number;
  mag: number;
  bv: number;
}

const raw = sky as unknown as { stars: number[]; names: Record<string, string>; constellations: { id: string; name: string; rank: number; label: [number, number]; lines: number[][] }[] };

export const STAR_COUNT = raw.stars.length / 4;

export function starInfo(i: number): StarInfo {
  return {
    index: i,
    name: raw.names[i] ?? null,
    ra: raw.stars[i * 4]!,
    dec: raw.stars[i * 4 + 1]!,
    mag: raw.stars[i * 4 + 2]!,
    bv: raw.stars[i * 4 + 3]!,
  };
}

export const namedStars = Object.entries(raw.names).map(([i, name]) => ({ index: Number(i), name }));
export const constellations = raw.constellations.map((c) => ({ id: c.id, name: c.name, ra: c.label[0], dec: c.label[1] }));

let cached: { jdDay: number; catalog: Catalog } | null = null;

/** The catalog precessed to a date; recomputed only when the day changes. */
export function catalogFor(jd: number): Catalog {
  const day = Math.floor(jd);
  if (cached && cached.jdDay === day) return cached.catalog;
  const vec = (ra: number, dec: number) => {
    const p = precess({ ra, dec }, jd);
    return eqVector(p.ra, p.dec);
  };
  const stars: number[] = [];
  const mag: number[] = [];
  const colors: Float32Array[] = [];
  const redColors: Float32Array[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const [x, y, z] = vec(raw.stars[i * 4]!, raw.stars[i * 4 + 1]!);
    stars.push(x, y, z);
    mag.push(raw.stars[i * 4 + 2]!);
    colors.push(Skia.Color(starColor(raw.stars[i * 4 + 3]!, false)));
    redColors.push(Skia.Color(starColor(0, true)));
  }
  const lines = raw.constellations.flatMap((c) =>
    c.lines.map((chain) => {
      const out: number[] = [];
      for (let k = 0; k < chain.length; k += 2) out.push(...vec(chain[k]!, chain[k + 1]!));
      return out;
    }),
  );
  const labels = raw.constellations.map((c) => {
    const [x, y, z] = vec(c.label[0], c.label[1]);
    return { x, y, z, name: c.name, rank: c.rank, id: c.id };
  });
  const names: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw.names)) names[Number(k)] = v;
  const catalog = { stars, mag, colors, redColors, names, lines, labels };
  cached = { jdDay: day, catalog };
  return catalog;
}
