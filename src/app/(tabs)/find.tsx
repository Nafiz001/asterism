import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toHorizontal } from "@/astro/coords";
import { moon, PLANETS, planet } from "@/astro/solar";
import { julianDay } from "@/astro/time";
import { PLANET_NAMES } from "@/sky/bodies";
import { constellations, namedStars, starInfo } from "@/sky/catalog";
import { compass } from "@/sky/InfoCard";
import { useMinute } from "@/state/clock";
import { usePalette, useSky, type Target } from "@/state/store";
import { fonts } from "@/ui/theme";

interface Item {
  key: string;
  name: string;
  detail: string;
  alt: number;
  target: NonNullable<Target>;
}

export default function FindScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { place, timeOffset, set } = useSky();
  const [q, setQ] = useState("");
  const now = useMinute();

  // Positions for the moment the sky is showing, time travel included.
  const items = useMemo(() => {
    const jd = julianDay(new Date(now.getTime() + timeOffset));
    const obs = { lat: place.lat, lon: place.lon };
    const where = (alt: number, az: number) => (alt > 0 ? `${Math.round(alt)}° up, ${compass(az)}` : "below the horizon");
    const bodies: Item[] = [];
    const m = toHorizontal(moon(jd), obs, jd);
    bodies.push({ key: "moon", name: "Moon", detail: where(m.alt, m.az), alt: m.alt, target: { kind: "moon", id: "moon", name: "the Moon" } });
    for (const p of PLANETS) {
      const h = toHorizontal(planet(p, jd), obs, jd);
      bodies.push({ key: p, name: PLANET_NAMES[p]!, detail: `Planet, ${where(h.alt, h.az)}`, alt: h.alt, target: { kind: "planet", id: p, name: PLANET_NAMES[p]! } });
    }
    const stars: Item[] = namedStars.map(({ index, name }) => {
      const st = starInfo(index);
      const h = toHorizontal({ ra: st.ra, dec: st.dec }, obs, jd);
      return { key: `star-${index}`, name, detail: `Star, mag ${st.mag.toFixed(1)}, ${where(h.alt, h.az)}`, alt: h.alt, target: { kind: "star", id: String(index), name } };
    });
    const figures: Item[] = constellations
      .map((c) => {
        const h = toHorizontal({ ra: c.ra, dec: c.dec }, obs, jd);
        return { key: `c-${c.id}`, name: c.name, detail: `Constellation, ${where(h.alt, h.az)}`, alt: h.alt, target: { kind: "constellation" as const, id: c.id, name: c.name } };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { bodies, stars, figures };
  }, [place, now, timeOffset]);

  const needle = q.trim().toLowerCase();
  const match = (i: Item) => !needle || i.name.toLowerCase().includes(needle);
  const sections = needle
    ? [{ title: "Results", data: [...items.bodies, ...items.stars, ...items.figures].filter(match) }]
    : [
        { title: "Up now", data: [...items.bodies.filter((b) => b.alt > 5), ...items.stars.slice(0, 40).filter((s) => s.alt > 15).slice(0, 8)] },
        { title: "The Moon and planets", data: items.bodies },
        { title: "Constellations", data: items.figures },
        { title: "Bright stars", data: items.stars },
      ];

  const go = (t: NonNullable<Target>) => {
    set({ target: t });
    router.navigate("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.sky, paddingTop: insets.top + 14 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={[styles.h1, { color: palette.ink }]}>Find</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="A star, a planet, a constellation"
          placeholderTextColor={palette.soft}
          autoCorrect={false}
          style={[styles.search, { color: palette.ink, borderColor: palette.panelLine, backgroundColor: palette.panel }]}
          accessibilityLabel="Search the sky"
        />
      </View>
      <SectionList
        sections={sections.filter((s) => s.data.length)}
        keyExtractor={(i) => i.key}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        renderSectionHeader={({ section }) => <Text style={[styles.section, { color: palette.gold }]}>{section.title}</Text>}
        ListEmptyComponent={<Text style={[styles.detail, { color: palette.soft, marginTop: 20 }]}>Nothing by that name in this sky.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => go(item.target)} style={({ pressed }) => [styles.row, { borderColor: palette.panelLine, opacity: pressed ? 0.6 : 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: item.alt > 0 ? palette.ink : palette.soft }]}>{item.name}</Text>
              <Text style={[styles.detail, { color: palette.soft }]}>{item.detail}</Text>
            </View>
            <Text style={[styles.show, { color: palette.gold }]}>Show</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 34 },
  search: { marginTop: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.ui, fontSize: 16 },
  section: { fontFamily: fonts.displayItalic, fontSize: 19, marginTop: 22, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontFamily: fonts.uiMedium, fontSize: 16 },
  detail: { fontFamily: fonts.ui, fontSize: 13, marginTop: 2 },
  show: { fontFamily: fonts.uiBold, fontSize: 14 },
});
