import type { LiveBody } from "./bodies";
import type { Catalog } from "./catalog";
import { DEG, equatorialToEnu, julianNow, mul, project, siderealDeg, transpose, type Mat3 } from "./engine";

export type Picked =
  | { kind: "star"; index: number }
  | { kind: "body"; id: string }
  | { kind: "constellation"; id: string };

/**
 * What's under a finger: the nearest thing drawn within reach, favouring
 * bright things (a tap near Jupiter means Jupiter, not the faint star
 * beside it).
 */
export function pick(
  x: number,
  y: number,
  view: { device: Mat3; fov: number; clock: number; lat: number; lon: number; width: number; height: number; limit: number },
  catalog: Catalog,
  bodies: LiveBody[],
): Picked | null {
  const f = view.height / 2 / Math.tan((view.fov / 2) * DEG);
  const deviceT = transpose(view.device);
  const lst = siderealDeg(julianNow(view.clock)) + view.lon;
  const pe = { m: mul(deviceT, equatorialToEnu(lst, view.lat)), f, cx: view.width / 2, cy: view.height / 2 };
  const pd = { m: deviceT, f, cx: view.width / 2, cy: view.height / 2 };
  const out = [0, 0];
  let best: { d: number; p: Picked } | null = null;
  const consider = (d: number, p: Picked) => {
    if (d < 34 && (!best || d < best.d)) best = { d, p };
  };
  for (const b of bodies) {
    if (b.kind === "planet" && b.mag > view.limit + 1) continue;
    if (project(pd, b.x, b.y, b.z, out)) consider(Math.hypot(out[0]! - x, out[1]! - y) - 12, { kind: "body", id: b.id });
  }
  for (let i = 0; i < catalog.mag.length; i++) {
    const m = catalog.mag[i]!;
    if (m > Math.min(view.limit, 5)) break;
    if (!project(pe, catalog.stars[i * 3]!, catalog.stars[i * 3 + 1]!, catalog.stars[i * 3 + 2]!, out)) continue;
    consider(Math.hypot(out[0]! - x, out[1]! - y) + m * 3, { kind: "star", index: i });
  }
  if (!best) {
    for (const l of catalog.labels) {
      if (project(pe, l.x, l.y, l.z, out) && Math.hypot(out[0]! - x, out[1]! - y) < 60) return { kind: "constellation", id: l.id };
    }
  }
  return (best as { d: number; p: Picked } | null)?.p ?? null;
}
