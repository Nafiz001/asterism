import { toHorizontal } from "@/astro/coords";
import { gmst } from "@/astro/time";
import { deviceToEnu, enuVector, eqVector, equatorialToEnu, lookAt, mul, pointing, project, siderealDeg, transpose, turnNorth } from "./engine";

const apply = (m: number[], v: number[]) => [0, 1, 2].map((i) => m[i * 3]! * v[0]! + m[i * 3 + 1]! * v[1]! + m[i * 3 + 2]! * v[2]!);

test("the frame-by-frame matrix agrees with the textbook transform", () => {
  const obs = { lat: 23.81, lon: 90.41 };
  const jd = 2461313.25;
  const lst = gmst(jd) + obs.lon;
  const a = equatorialToEnu(lst, obs.lat);
  for (const [ra, dec] of [[101.287, -16.716], [279.23, 38.78], [37.95, 89.26], [213.9, 19.2]]) {
    const h = toHorizontal({ ra: ra!, dec: dec! }, obs, jd);
    const want = enuVector(h.alt, h.az);
    const got = apply(a, eqVector(ra!, dec!));
    for (let i = 0; i < 3; i++) expect(got[i]!).toBeCloseTo(want[i]!, 6);
  }
  expect(siderealDeg(jd)).toBeCloseTo(gmst(jd), 6);
});

test("looking at a point puts it at the centre of the screen", () => {
  for (const [az, alt] of [[0, 0], [90, 30], [200, 60], [315, 5]]) {
    const view = lookAt(az!, alt!);
    const p = pointing(view);
    expect(p.az).toBeCloseTo(az!, 6);
    expect(p.alt).toBeCloseTo(alt!, 6);
    const out = [0, 0];
    expect(project({ m: transpose(view), f: 500, cx: 200, cy: 400 }, ...enuVector(alt!, az!), out)).toBe(true);
    expect(out[0]).toBeCloseTo(200, 6);
    expect(out[1]).toBeCloseTo(400, 6);
  }
});

test("east of centre appears to the right, higher appears above", () => {
  const p = { m: transpose(lookAt(180, 20)), f: 500, cx: 0, cy: 0 };
  const out = [0, 0];
  // Facing south, east is to the left and west to the right.
  project(p, ...enuVector(20, 170), out);
  expect(out[0]).toBeLessThan(0);
  project(p, ...enuVector(25, 180), out);
  expect(out[1]).toBeLessThan(0);
  // Behind the viewer: not drawn.
  expect(project(p, ...enuVector(20, 0), out)).toBe(false);
});

test("the sensor's quaternion, undone, is a proper rotation", () => {
  // A phone held upright facing north: Android's rotation vector is a 90°
  // turn about east, i.e. (x, y, z, w) = (sin 45°, 0, 0, cos 45°);
  // Reanimated reports (qx, qy, qz) = (x, z, −y).
  const s = Math.SQRT1_2;
  const m = deviceToEnu(s, 0, 0, s);
  expect(pointing(m).alt).toBeCloseTo(0, 6);
  expect(pointing(m).az).toBeCloseTo(0, 6);
  const i = mul(m, transpose(m));
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, k) => expect(i[k]!).toBeCloseTo(v, 9));
});

test("declination turns north towards east", () => {
  const m = turnNorth(lookAt(0, 0), 10);
  expect(pointing(m).az).toBeCloseTo(10, 6);
});
