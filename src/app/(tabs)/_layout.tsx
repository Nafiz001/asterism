import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "@/state/store";
import { fonts } from "@/ui/theme";

const LABELS: Record<string, string> = { index: "Sky", tonight: "Tonight", find: "Find" };

export default function TabsLayout() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.sky } }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.bar, { paddingBottom: insets.bottom + 6, backgroundColor: palette.panel, borderTopColor: palette.panelLine }]}>
          {state.routes.map((r, i) => {
            const on = state.index === i;
            return (
              <Pressable
                key={r.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => navigation.navigate(r.name)}
                style={styles.tab}
              >
                <Text style={[styles.label, { color: on ? palette.gold : palette.soft }]}>{LABELS[r.name] ?? r.name}</Text>
                <View style={[styles.mark, { backgroundColor: on ? palette.gold : "transparent" }]} />
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="tonight" />
      <Tabs.Screen name="find" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  tab: { flex: 1, alignItems: "center", gap: 6 },
  label: { fontFamily: fonts.display, fontSize: 19 },
  mark: { width: 5, height: 5, borderRadius: 3 },
});
