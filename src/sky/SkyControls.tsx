import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { usePalette, useSky } from "@/state/store";
import { fonts } from "@/ui/theme";

const HOUR = 3_600_000;

function offsetLabel(ms: number): string {
  if (ms === 0) return "Now";
  const sign = ms > 0 ? "+" : "−";
  const h = Math.abs(ms) / HOUR;
  if (h >= 24) return `${sign}${Math.round(h / 24)} d`;
  return `${sign}${Math.round(h)} h`;
}

/** The dock over the sky: time travel, compass or hand, camera, layers. */
export function SkyControls({ hasSensor, mode, onRecenter, onCamera }: { hasSensor: boolean; mode: "sensor" | "manual"; onRecenter: () => void; onCamera: () => void }) {
  const palette = usePalette();
  const s = useSky();
  const [layers, setLayers] = useState(false);
  const shift = (ms: number) => {
    Haptics.selectionAsync().catch(() => {});
    s.set({ timeOffset: ms === 0 ? 0 : s.timeOffset + ms });
  };
  const chip = [styles.chip, { borderColor: palette.panelLine, backgroundColor: palette.panel }];

  return (
    <View style={[styles.dock, { bottom: 16 }]} pointerEvents="box-none">
      {layers && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={[styles.sheet, { backgroundColor: palette.panel, borderColor: palette.panelLine }]}>
          {(
            [
              ["Constellation figures", "showLines"],
              ["Names", "showLabels"],
              ["Altitude and azimuth grid", "showGrid"],
              ["Night vision (red)", "redMode"],
            ] as const
          ).map(([label, key]) => (
            <View key={key} style={styles.row}>
              <Text style={[styles.rowText, { color: palette.ink }]}>{label}</Text>
              <Switch
                value={s[key]}
                onValueChange={(v) => s.set({ [key]: v })}
                trackColor={{ true: palette.gold, false: "#333a55" }}
                thumbColor={palette.ink}
              />
            </View>
          ))}
          {Platform.OS !== "web" && (
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: palette.ink }]}>Sky over the camera</Text>
              <Switch value={s.camera} onValueChange={onCamera} trackColor={{ true: palette.gold, false: "#333a55" }} thumbColor={palette.ink} />
            </View>
          )}
          {hasSensor && (
            <View style={styles.nudge}>
              <Text style={[styles.rowText, { color: palette.ink }]}>Compass correction</Text>
              <Text style={[styles.help, { color: palette.soft }]}>If the stars sit to one side of where they really are, shift them.</Text>
              <View style={styles.nudgeRow}>
                {[-5, -1, 1, 5].map((d) => (
                  <Pressable key={d} onPress={() => s.set({ yawNudge: s.yawNudge + d })} style={chip}>
                    <Text style={[styles.chipText, { color: palette.ink }]}>{d > 0 ? `+${d}°` : `${d}°`}</Text>
                  </Pressable>
                ))}
                <Text style={[styles.help, { color: palette.soft, marginLeft: 6 }]}>{Math.round(s.yawNudge)}°</Text>
              </View>
            </View>
          )}
        </Animated.View>
      )}
      <View style={styles.bar}>
        <View style={styles.group}>
          <Pressable onPress={() => shift(-HOUR)} style={chip} accessibilityLabel="An hour earlier">
            <Text style={[styles.chipText, { color: palette.ink }]}>−1 h</Text>
          </Pressable>
          <Pressable onPress={() => shift(0)} style={[chip, s.timeOffset !== 0 && { borderColor: palette.gold }]} accessibilityLabel="Back to now">
            <Text style={[styles.chipText, { color: s.timeOffset !== 0 ? palette.gold : palette.ink }]}>{offsetLabel(s.timeOffset)}</Text>
          </Pressable>
          <Pressable onPress={() => shift(HOUR)} style={chip} accessibilityLabel="An hour later">
            <Text style={[styles.chipText, { color: palette.ink }]}>+1 h</Text>
          </Pressable>
        </View>
        <View style={styles.group}>
          {hasSensor && mode === "manual" && (
            <Pressable onPress={onRecenter} style={[chip, { borderColor: palette.gold }]} accessibilityLabel="Follow the phone again">
              <Text style={[styles.chipText, { color: palette.gold }]}>Follow phone</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setLayers((l) => !l)} style={[chip, layers && { borderColor: palette.gold }]} accessibilityLabel="What to show">
            <Text style={[styles.chipText, { color: palette.ink }]}>Layers</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 12, right: 12 },
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  group: { flexDirection: "row", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  chipText: { fontFamily: fonts.uiMedium, fontSize: 14 },
  sheet: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 10, gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  rowText: { fontFamily: fonts.uiMedium, fontSize: 15 },
  help: { fontFamily: fonts.ui, fontSize: 13, marginTop: 2 },
  nudge: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(212,177,106,0.25)", paddingTop: 10, marginTop: 4 },
  nudgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
});
