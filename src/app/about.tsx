import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "@/state/store";
import { fonts } from "@/ui/theme";

const SOURCES: [string, string][] = [
  ["Stars and constellations", "The d3-celestial catalogue by Olaf Frohn (BSD 3-Clause): 5,044 stars to magnitude 6, from the Hipparcos mission, and the IAU constellation figures."],
  ["The Sun, the Moon and planets", "Computed on your phone from Jean Meeus's Astronomical Algorithms and JPL's planetary elements (E. M. Standish). Good to a few minutes of arc."],
  ["Space stations", "NORAD orbital elements published by CelesTrak, propagated with the SGP4 model via satellite.js, refreshed twice a day."],
  ["Clouds", "Hourly cloud cover from Open-Meteo."],
];

export default function About() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: palette.sky }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 16 }}>
      <Text style={[styles.h1, { color: palette.ink }]}>About Asterism</Text>
      <Text style={[styles.body, { color: palette.soft }]}>
        An asterism is a pattern of stars people recognise: the Big Dipper, the Summer Triangle. This app works out where every one of them is,
        from where you are, right now, and draws it over whatever your phone is pointing at.
      </Text>
      {SOURCES.map(([title, text]) => (
        <Text key={title} style={[styles.body, { color: palette.soft }]}>
          <Text style={{ color: palette.gold, fontFamily: fonts.uiBold }}>{title}. </Text>
          {text}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 32 },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22 },
});
