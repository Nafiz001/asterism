// Builds src/data/sky.json from Olaf Frohn's d3-celestial data (BSD 3-Clause):
// every star to magnitude 6 (about what the eye sees from a dark site),
// their proper names, and the IAU constellations with their stick figures.
//
//   npm run catalog

import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/";

async function get(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

const [stars, names, lines, consts] = await Promise.all([
  get("stars.6.json"),
  get("starnames.json"),
  get("constellations.lines.json"),
  get("constellations.json"),
]);

const ra360 = (ra) => (ra < 0 ? ra + 360 : ra);
const r = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

// Brightest first, so the renderer can stop early at a magnitude limit.
const list = stars.features
  .map((f) => ({ id: f.id, ra: ra360(f.geometry.coordinates[0]), dec: f.geometry.coordinates[1], mag: f.properties.mag, bv: Number(f.properties.bv) || 0.6 }))
  .filter((s) => Number.isFinite(s.mag))
  .sort((a, b) => a.mag - b.mag);

const flat = [];
const starNames = {};
list.forEach((s, i) => {
  flat.push(r(s.ra), r(s.dec), r(s.mag, 2), r(s.bv, 2));
  const n = names[s.id]?.name;
  if (n && s.mag < 4.5) starNames[i] = n;
});

const constellations = consts.features.map((f) => {
  const l = lines.features.find((x) => x.id === f.id);
  return {
    id: f.id,
    name: f.properties.name,
    rank: Number(f.properties.rank),
    label: [r(ra360(f.geometry.coordinates[0])), r(f.geometry.coordinates[1])],
    lines: (l?.geometry.coordinates ?? []).map((seg) => seg.flatMap(([ra, dec]) => [r(ra360(ra)), r(dec)])),
  };
});

mkdirSync("src/data", { recursive: true });
writeFileSync(
  "src/data/sky.json",
  JSON.stringify({ source: "d3-celestial by Olaf Frohn, BSD 3-Clause", stars: flat, names: starNames, constellations }),
);
console.log(`${list.length} stars, ${Object.keys(starNames).length} named, ${constellations.length} constellations`);
