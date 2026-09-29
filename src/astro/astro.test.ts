import { precess, refraction, separation, toHorizontal } from "./coords";
import { crossings, H0, night, phaseName, sunAltitude } from "./events";
import { parseTle, passes, toSatellite } from "./satellites";
import { moon, planet, sun } from "./solar";
import { gmst, julianDay, norm180 } from "./time";

// Worked examples from Jean Meeus, Astronomical Algorithms (2nd ed.).

const close = (got: number, want: number, tol: number) => {
  expect(Math.abs(norm180(got - want))).toBeLessThan(tol);
};

test("Julian day (ex. 7.a: 1957 Oct 4.81, Sputnik)", () => {
  expect(julianDay(new Date(Date.UTC(1957, 9, 4, 19, 26, 24)))).toBeCloseTo(2436116.31, 2);
});

test("sidereal time (ex. 12.a and 12.b)", () => {
  close(gmst(2446895.5), 197.693195, 1e-5);
  close(gmst(julianDay(new Date(Date.UTC(1987, 3, 10, 19, 21, 0)))), 128.7378734, 1e-5);
});

test("the Sun (ex. 25.a: 1992 Oct 13.0)", () => {
  const s = sun(2448908.5);
  close(s.ra, 198.38083, 0.005);
  close(s.dec, -7.78507, 0.005);
  expect(s.distance).toBeCloseTo(0.99766, 4);
});

test("the Moon (ex. 47.a: 1992 Apr 12.0)", () => {
  const m = moon(2448724.5);
  close(m.longitude, 133.162655, 0.02);
  close(m.latitude, -3.229126, 0.01);
  expect(Math.abs(m.distance - 368409.7)).toBeLessThan(150);
  close(m.ra, 134.68847, 0.03);
  close(m.dec, 13.768368, 0.02);
  // Ex. 48.a: 68% lit and waxing, five days before full.
  expect(m.illumination).toBeGreaterThan(0.66);
  expect(m.illumination).toBeLessThan(0.7);
  expect(m.waxing).toBe(true);
});

test("Venus (ex. 33.a: 1992 Dec 20.0)", () => {
  const v = planet("venus", 2448976.5);
  close(v.ra, 316.17291, 0.05);
  close(v.dec, -18.88801, 0.05);
  expect(v.distance).toBeCloseTo(0.9109, 2);
  expect(v.mag).toBeLessThan(-4);
});

test("horizontal coordinates (ex. 13.b: Venus from Washington)", () => {
  const h = toHorizontal(
    { ra: 347.3193375, dec: -6.719892 },
    { lat: 38 + 55 / 60 + 17 / 3600, lon: -(77 + 3 / 60 + 56 / 3600) },
    julianDay(new Date(Date.UTC(1987, 3, 10, 19, 21, 0))),
  );
  close(h.alt, 15.1249, 0.01);
  close(h.az, 68.0337 + 180, 0.01); // Meeus measures from the south
});

test("precession (ex. 21.b: θ Persei to 2028)", () => {
  const p = precess({ ra: 41.054063, dec: 49.22775 }, 2462088.69);
  close(p.ra, 41.547214, 0.01);
  close(p.dec, 49.348483, 0.01);
});

test("refraction lifts the horizon by about half a degree", () => {
  expect(refraction(0)).toBeGreaterThan(0.45);
  expect(refraction(0)).toBeLessThan(0.6);
  expect(refraction(45)).toBeLessThan(0.02);
});

test("separation: Arcturus to Spica is 32.8° (ex. 17.a)", () => {
  expect(separation({ ra: 213.9154, dec: 19.1825 }, { ra: 201.2983, dec: -11.1614 })).toBeCloseTo(32.7930, 2);
});

test("sunrise and sunset in Dhaka on the equinox", () => {
  const dhaka = { lat: 23.8103, lon: 90.4125 };
  const start = julianDay(new Date(Date.UTC(2026, 2, 20, 18, 0, 0))); // local midnight
  const events = crossings(sunAltitude(dhaka), H0.sun, start, start + 1);
  expect(events).toHaveLength(2);
  const [rise, set] = events.map((e) => new Date((e.jd - 2440587.5) * 86400000));
  // About 06:02 and 18:10 local time (UTC+6).
  const riseLocal = ((rise!.getUTCHours() + 6) % 24) * 60 + rise!.getUTCMinutes();
  const setLocal = ((set!.getUTCHours() + 6) % 24) * 60 + set!.getUTCMinutes();
  expect(Math.abs(riseLocal - (6 * 60 + 2))).toBeLessThan(6);
  expect(Math.abs(setLocal - (18 * 60 + 10))).toBeLessThan(6);
});

test("a summer night in Reykjavik never gets fully dark", () => {
  const n = night({ lat: 64.15, lon: -21.94 }, new Date(Date.UTC(2026, 5, 21, 12)));
  expect(n.neverDark).toBe(true);
  expect(n.darkFrom).toBeNull();
});

test("a winter night in Dhaka has hours of darkness", () => {
  const n = night({ lat: 23.81, lon: 90.41 }, new Date(Date.UTC(2026, 11, 21, 6)));
  expect(n.darkFrom && n.darkTo).toBeTruthy();
  const hours = (n.darkTo!.getTime() - n.darkFrom!.getTime()) / 3.6e6;
  expect(hours).toBeGreaterThan(9);
  expect(hours).toBeLessThan(12);
});

test("phase names", () => {
  expect(phaseName(0.01, true)).toBe("New moon");
  expect(phaseName(0.3, true)).toBe("Waxing crescent");
  expect(phaseName(0.5, false)).toBe("Last quarter");
  expect(phaseName(0.99, false)).toBe("Full moon");
});

// The ISS in a published element set; passes are found and are sensible.
const ISS = `ISS (ZARYA)
1 25544U 98067A   26268.51782528  .00016717  00000-0  30108-3 0  9992
2 25544  51.6400 208.9163 0002571 105.3290 254.8060 15.49507454471234`;

test("ISS passes over Dhaka", () => {
  const tle = parseTle(ISS);
  expect(tle).toHaveLength(1);
  const iss = toSatellite(tle[0]!)!;
  const found = passes(iss, { lat: 23.81, lon: 90.41 }, new Date(Date.UTC(2026, 8, 25, 12)), 3);
  expect(found.length).toBeGreaterThan(3);
  for (const p of found) {
    expect(p.maxAlt).toBeGreaterThanOrEqual(10);
    expect(p.maxAlt).toBeLessThanOrEqual(90);
    const minutes = (p.set.getTime() - p.rise.getTime()) / 60000;
    expect(minutes).toBeGreaterThan(0);
    expect(minutes).toBeLessThan(12);
  }
});
