import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { crossings, culmination, H0, altitudeOf, jdToDate, moonAltitude, phaseName, sunAltitude } from "@/astro/events";
import { moon, planet, type PlanetName } from "@/astro/solar";
import { julianDay } from "@/astro/time";
import { skyTime, usePalette, useSky, type Target } from "@/state/store";
import { fonts } from "@/ui/theme";
import type { LiveBody } from "./bodies";
import { constellations, starInfo } from "./catalog";
import type { Picked } from "./pick";

const time = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface Line {
  label: string;
  value: string;
}

/** The next rise and set within a day, and how high it gets. */
function riseSet(alt: (jd: number) => number, h: number, from: Date): Line[] {
  const jd = julianDay(from);
  const events = crossings(alt, h, jd, jd + 1, 10);
  const top = culmination(alt, jd, jd + 1);
  const rise = events.find((e) => e.rising);
  const set = events.find((e) => !e.rising);
  const out: Line[] = [];
  if (!rise && !set) out.push({ label: "Tonight", value: alt(jd) > h ? "Up all day" : "Doesn't rise today" });
  if (rise) out.push({ label: "Rises", value: time(jdToDate(rise.jd)) });
  if (set) out.push({ label: "Sets", value: time(jdToDate(set.jd)) });
  out.push({ label: "Highest", value: `${Math.round(top.alt)}° at ${time(jdToDate(top.jd))}` });
  return out;
}

export function InfoCard({ picked, bodies, onClose, onFind }: { picked: Picked; bodies: LiveBody[]; onClose: () => void; onFind: (t: Target) => void }) {
  const palette = usePalette();
  const { place, timeOffset } = useSky();
  const when = skyTime(timeOffset);

  const card = useMemo(() => {
    const obs = { lat: place.lat, lon: place.lon };
    if (picked.kind === "star") {
      const st = starInfo(picked.index);
      const alt = altitudeOf(() => ({ ra: st.ra, dec: st.dec }), obs);
      const colour = st.bv < 0 ? "blue-white, hotter than the Sun" : st.bv < 0.5 ? "white" : st.bv < 1 ? "yellow, like the Sun" : st.bv < 1.4 ? "orange" : "red-orange, cooler than the Sun";
      return {
        title: st.name ?? "A star",
        kind: `Star, ${colour}`,
        lines: [
          { label: "Brightness", value: `magnitude ${st.mag.toFixed(1)}` },
          { label: "Now", value: `${Math.round(alt(julianDay(when)))}° above the horizon` },
          ...riseSet(alt, H0.star, when),
        ],
        target: { kind: "star" as const, id: String(picked.index), name: st.name ?? "the star" },
      };
    }
    if (picked.kind === "constellation") {
      const c = constellations.find((x) => x.id === picked.id)!;
      return {
        title: c.name,
        kind: "Constellation",
        lines: riseSet(altitudeOf(() => ({ ra: c.ra, dec: c.dec }), obs), H0.star, when),
        target: { kind: "constellation" as const, id: c.id, name: c.name },
      };
    }
    const b = bodies.find((x) => x.id === picked.id);
    if (!b) return null;
    const now = [{ label: "Now", value: b.alt > 0 ? `${Math.round(b.alt)}° up, towards ${compass(b.az)}` : `Below the horizon, ${compass(b.az)}` }];
    if (b.kind === "sun") {
      return {
        title: "The Sun",
        kind: "Our star",
        warn: "Never look at the Sun directly, and never through binoculars or a camera.",
        lines: [...now, ...riseSet(sunAltitude(obs), H0.sun, when)],
        target: { kind: "sun" as const, id: "sun", name: "the Sun" },
      };
    }
    if (b.kind === "moon") {
      const m = moon(julianDay(when));
      return {
        title: "The Moon",
        kind: `${phaseName(m.illumination, m.waxing)}, ${Math.round(m.illumination * 100)}% lit`,
        lines: [...now, { label: "Distance", value: `${Math.round(m.distance).toLocaleString()} km` }, ...riseSet(moonAltitude(obs), H0.moon, when)],
        target: { kind: "moon" as const, id: "moon", name: "the Moon" },
      };
    }
    if (b.kind === "planet") {
      const p = planet(b.id as PlanetName, julianDay(when));
      const light = (p.distance * 149.6e6) / 299792.458 / 60;
      return {
        title: b.name,
        kind: "Planet",
        lines: [
          ...now,
          { label: "Brightness", value: `magnitude ${p.mag.toFixed(1)}` },
          { label: "Distance", value: `${p.distance.toFixed(2)} au, ${light < 60 ? `${Math.round(light)} light-minutes` : `${(light / 60).toFixed(1)} light-hours`}` },
          ...riseSet(altitudeOf((jd) => planet(b.id as PlanetName, jd), obs), H0.star, when),
        ],
        target: { kind: "planet" as const, id: b.id, name: b.name },
      };
    }
    return {
      title: b.name,
      kind: b.name === "ISS" ? "International Space Station, crewed" : "Chinese space station, crewed",
      lines: [
        ...now,
        { label: "Distance", value: `${Math.round(b.distance ?? 0).toLocaleString()} km away` },
        { label: "Light", value: b.sunlit ? "In sunlight: visible if your sky is dark" : "In the Earth's shadow: not visible now" },
      ],
      target: { kind: "satellite" as const, id: b.id, name: b.name },
    };
  }, [picked, bodies, place, when]);

  if (!card) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.card, { backgroundColor: palette.panel, borderColor: palette.panelLine, bottom: 72 }]}
    >
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: palette.ink }]}>{card.title}</Text>
          <Text style={[styles.kind, { color: palette.soft }]}>{card.kind}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Text style={[styles.close, { color: palette.soft }]}>✕</Text>
        </Pressable>
      </View>
      {"warn" in card && card.warn && <Text style={[styles.warn, { color: palette.danger }]}>{card.warn}</Text>}
      <View style={styles.lines}>
        {card.lines.map((l) => (
          <View key={l.label} style={styles.line}>
            <Text style={[styles.label, { color: palette.soft }]}>{l.label}</Text>
            <Text style={[styles.value, { color: palette.ink }]}>{l.value}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={() => onFind(card.target)} style={[styles.find, { borderColor: palette.gold }]}>
        <Text style={[styles.findText, { color: palette.gold }]}>Keep it marked</Text>
      </Pressable>
    </Animated.View>
  );
}

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export function compass(az: number): string {
  return POINTS[Math.round(az / 45) % 8]!;
}

const styles = StyleSheet.create({
  card: { position: "absolute", left: 12, right: 12, borderRadius: 20, borderWidth: 1, padding: 18 },
  head: { flexDirection: "row", alignItems: "flex-start" },
  title: { fontFamily: fonts.display, fontSize: 28 },
  kind: { fontFamily: fonts.ui, fontSize: 14, marginTop: 2 },
  close: { fontSize: 18, padding: 4 },
  warn: { fontFamily: fonts.uiMedium, fontSize: 14, marginTop: 10 },
  lines: { marginTop: 14, gap: 7 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { fontFamily: fonts.ui, fontSize: 14 },
  value: { fontFamily: fonts.uiMedium, fontSize: 14, flexShrink: 1, textAlign: "right" },
  find: { marginTop: 16, alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  findText: { fontFamily: fonts.uiBold, fontSize: 14 },
});
