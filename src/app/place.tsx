import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CITIES, locate } from "@/state/data";
import { usePalette, useSky } from "@/state/store";
import { fonts } from "@/ui/theme";

export default function PlaceScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { place, set } = useSky();
  const [status, setStatus] = useState<string | null>(null);

  return (
    <ScrollView style={{ backgroundColor: palette.sky }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 6 }}>
      <Text style={[styles.h1, { color: palette.ink }]}>Where are you?</Text>
      <Text style={[styles.body, { color: palette.soft }]}>The sky depends on where you stand. Showing {place.name} now.</Text>
      <Pressable
        onPress={async () => {
          setStatus("Finding you…");
          const r = await locate();
          if (r === "ok") router.back();
          else setStatus(r === "denied" ? "Location is off for Asterism. Choose a city instead, or allow it in Settings." : "Couldn't get a fix. Choose a city instead.");
        }}
        style={[styles.primary, { backgroundColor: palette.ink }]}
      >
        <Text style={[styles.primaryText, { color: palette.sky }]}>Use my location</Text>
      </Pressable>
      {status && <Text style={[styles.body, { color: palette.soft }]}>{status}</Text>}
      <Text style={[styles.section, { color: palette.gold }]}>Or a city</Text>
      {CITIES.map((c) => (
        <Pressable
          key={c.name}
          onPress={() => {
            set({ place: { ...c, source: "chosen" }, declination: 0 });
            router.back();
          }}
          style={[styles.row, { borderColor: palette.panelLine }]}
        >
          <Text style={[styles.name, { color: place.name === c.name ? palette.gold : palette.ink }]}>{c.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 32 },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21 },
  primary: { marginTop: 14, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  primaryText: { fontFamily: fonts.uiBold, fontSize: 16 },
  section: { fontFamily: fonts.displayItalic, fontSize: 19, marginTop: 20 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontFamily: fonts.uiMedium, fontSize: 16 },
});
