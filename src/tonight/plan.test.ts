import { darkness, planTonight, scoreHour } from "./plan";

test("darkness steps through the twilights", () => {
  expect(darkness(10)).toBe(0);
  expect(darkness(-8)).toBeCloseTo(0.3);
  expect(darkness(-15)).toBeCloseTo(0.7);
  expect(darkness(-25)).toBe(1);
});

test("clouds and a bright Moon spoil an hour", () => {
  const clear = scoreHour(-30, 0, -10, 1).score;
  const cloudy = scoreHour(-30, 90, -10, 1).score;
  const moonlit = scoreHour(-30, 0, 40, 1).score;
  expect(clear).toBe(1);
  expect(cloudy).toBeLessThan(0.15);
  expect(moonlit).toBeLessThan(0.5);
  expect(scoreHour(-30, 0, 40, 0.05).score).toBeGreaterThan(0.95); // a thin crescent barely matters
});

test("a clear winter night in Dhaka has a good window and some planets", () => {
  const t = planTonight({ lat: 23.81, lon: 90.41 }, new Date(Date.UTC(2026, 11, 14, 8)), null, []);
  expect(t.night.sunset).not.toBeNull();
  expect(t.hours.length).toBeGreaterThan(10);
  expect(t.best).not.toBeNull();
  expect(t.planets.length).toBeGreaterThan(0);
  for (const p of t.planets) expect(p.alt).toBeGreaterThanOrEqual(10);
});

test("with the weather, an overcast night has no good window", () => {
  const start = new Date(Date.UTC(2026, 11, 14, 0));
  const weather = Array.from({ length: 72 }, (_, i) => ({
    time: new Date(start.getTime() + i * 3600_000).toISOString(),
    cloud: 100,
    cloudLow: 100,
    humidity: 90,
  }));
  const t = planTonight({ lat: 23.81, lon: 90.41 }, new Date(Date.UTC(2026, 11, 14, 8)), weather, []);
  expect(t.best).toBeNull();
});
