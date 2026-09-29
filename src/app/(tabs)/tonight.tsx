import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { phaseName } from "@/astro/events";
import { useMinute } from "@/state/clock";
import { forecast, useSatellites, type HourForecast } from "@/state/data";
import { usePalette, useSky } from "@/state/store";
import { compass } from "@/sky/InfoCard";
import { PLANET_NAMES } from "@/sky/bodies";
import { MoonPhase } from "@/tonight/MoonPhase";
import { planTonight } from "@/tonight/plan";
import { fonts } from "@/ui/theme";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

const clock = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "none");
const day = (d: Date) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

export default function TonightScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { place, redMode, set } = useSky();
  const { satellites: sats, failed: satsFailed } = useSatellites();
  const [weather, setWeather] = useState<HourForecast[] | null>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const now = useMinute();

  useEffect(() => {
    let alive = true;
    forecast(place.lat, place.lon).then((w) => {
      if (!alive) return;
      setWeather(w);
      setWeatherFailed(!w);
    });
    return () => {
      alive = false;
    };
  }, [place.lat, place.lon]);

  const plan = useMemo(() => planTonight({ lat: place.lat, lon: place.lon }, now, weather, sats), [place, weather, sats, now]);
  const n = plan.night;

  async function remind(key: string, name: string, at: Date, from: string) {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const when = new Date(at.getTime() - 5 * 60_000);
    if (when.getTime() < new Date().getTime()) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: `${name} in five minutes`, body: `Look ${from}: it rises at ${clock(at)} and crosses the sky in a few minutes.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    setReminded((r) => ({ ...r, [key]: true }));
  }

  const summary = plan.best
    ? `Best from ${clock(plan.best.from)} to ${clock(plan.best.to)}`
    : n.neverDark
      ? "It doesn't get fully dark here tonight"
      : weather
        ? "Clouds or moonlight spoil most of tonight"
        : "Dark enough to see the stars tonight";

  const card = [styles.card, { backgroundColor: palette.panel, borderColor: palette.panelLine }];
  const maxBar = 64;

  return (
    <ScrollView style={{ backgroundColor: palette.sky }} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 40, paddingHorizontal: 16, gap: 14 }}>
      <View>
        <Text style={[styles.overline, { color: palette.soft }]}>{day(now)}</Text>
        <Text style={[styles.h1, { color: palette.ink }]}>Tonight in {place.name}</Text>
        <Text style={[styles.lede, { color: palette.gold }]}>{summary}</Text>
      </View>

      <View style={card}>
        <View style={styles.bars} accessibilityLabel="Hour by hour, how good the sky is">
          {plan.hours.map((h) => (
            <View key={h.at.getTime()} style={styles.barCol}>
              <View style={[styles.barTrack, { height: maxBar }]}>
                <View
                  style={{
                    height: Math.max(3, h.score * maxBar),
                    backgroundColor: h.score >= 0.45 ? palette.gold : palette.soft,
                    opacity: h.score >= 0.45 ? 1 : 0.35,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text style={[styles.barLabel, { color: palette.soft }]}>{h.at.getHours()}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.note, { color: palette.soft }]}>
          {weatherFailed
            ? "Couldn't get the cloud forecast; this counts only darkness and the Moon."
            : "Taller is better: dark sky, few clouds, little moonlight. Cloud forecast from Open-Meteo."}
        </Text>
        <View style={styles.times}>
          {[
            ["Sunset", n.sunset],
            ["Dark from", n.darkFrom],
            ["Dark until", n.darkTo],
            ["Sunrise", n.sunrise],
          ].map(([label, d]) => (
            <View key={label as string}>
              <Text style={[styles.timeLabel, { color: palette.soft }]}>{label as string}</Text>
              <Text style={[styles.timeValue, { color: palette.ink }]}>{clock(d as Date | null)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[card, styles.moon]}>
        <MoonPhase size={84} illumination={plan.moon.illumination} waxing={plan.moon.waxing} red={redMode} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.h2, { color: palette.ink }]}>{phaseName(plan.moon.illumination, plan.moon.waxing)}</Text>
          <Text style={[styles.body, { color: palette.soft }]}>
            {Math.round(plan.moon.illumination * 100)}% lit.{" "}
            {plan.moon.rise ? `Rises ${clock(plan.moon.rise)}` : "Already up at sunset"}
            {plan.moon.set ? `, sets ${clock(plan.moon.set)}.` : ", and up until morning."}
          </Text>
          <Text style={[styles.body, { color: palette.soft }]}>
            {plan.moon.illumination > 0.6 ? "Bright enough to wash out the faint stars while it's up." : "Dim enough to leave the faint stars alone."}
          </Text>
        </View>
      </View>

      <View style={card}>
        <Text style={[styles.h2, { color: palette.ink }]}>Planets</Text>
        {plan.planets.length === 0 && <Text style={[styles.body, { color: palette.soft }]}>No planets climb high enough tonight.</Text>}
        {plan.planets.map((p) => (
          <Pressable
            key={p.id}
            style={styles.row}
            onPress={() => {
              set({ target: { kind: "planet", id: p.id, name: PLANET_NAMES[p.id]! } });
              router.navigate("/");
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: palette.ink }]}>{PLANET_NAMES[p.id]}</Text>
              <Text style={[styles.body, { color: palette.soft }]}>
                Best at {clock(p.best)}, {Math.round(p.alt)}° up in the {compass(p.az)}
                {p.needs === "eye" ? "" : p.needs === "binoculars" ? ". Take binoculars." : ". Needs a telescope."}
              </Text>
            </View>
            <Text style={[styles.go, { color: palette.gold }]}>Show</Text>
          </Pressable>
        ))}
      </View>

      <View style={card}>
        <Text style={[styles.h2, { color: palette.ink }]}>Space stations</Text>
        {sats.length === 0 && (
          <Text style={[styles.body, { color: palette.soft }]}>
            {satsFailed ? "Couldn't get the orbits from CelesTrak. Passes will show once the phone is back online." : "Getting the latest orbits from CelesTrak…"}
          </Text>
        )}
        {sats.length > 0 && plan.passes.length === 0 && (
          <Text style={[styles.body, { color: palette.soft }]}>No visible passes in the next three days. They are only visible at dusk and dawn, lit by a Sun you can&apos;t see.</Text>
        )}
        {plan.passes.map((p) => {
          const key = `${p.satellite}-${p.rise.getTime()}`;
          const minutes = Math.max(1, Math.round((p.set.getTime() - p.rise.getTime()) / 60_000));
          return (
            <View key={key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: palette.ink }]}>
                  {p.satellite}, {day(p.rise)} {clock(p.rise)}
                </Text>
                <Text style={[styles.body, { color: palette.soft }]}>
                  From the {compass(p.riseAz)} to the {compass(p.setAz)}, {Math.round(p.maxAlt)}° high, {minutes} min
                </Text>
              </View>
              {Platform.OS !== "web" && (
                <Pressable disabled={reminded[key]} onPress={() => remind(key, p.satellite, p.rise, compass(p.riseAz))}>
                  <Text style={[styles.go, { color: reminded[key] ? palette.soft : palette.gold }]}>{reminded[key] ? "Reminder set" : "Remind me"}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <Pressable onPress={() => router.push("/about")}>
        <Text style={[styles.footer, { color: palette.soft }]}>About the data</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  overline: { fontFamily: fonts.uiMedium, fontSize: 13 },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, marginTop: 2 },
  lede: { fontFamily: fonts.uiMedium, fontSize: 16, marginTop: 6 },
  h2: { fontFamily: fonts.display, fontSize: 24, marginBottom: 4 },
  body: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  bars: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  barCol: { alignItems: "center", flex: 1 },
  barTrack: { width: 8, justifyContent: "flex-end" },
  barLabel: { fontFamily: fonts.ui, fontSize: 10, marginTop: 4 },
  note: { fontFamily: fonts.ui, fontSize: 12, marginTop: 10, lineHeight: 17 },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  timeLabel: { fontFamily: fonts.ui, fontSize: 12 },
  timeValue: { fontFamily: fonts.uiBold, fontSize: 15, marginTop: 2 },
  moon: { flexDirection: "row", gap: 14, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowTitle: { fontFamily: fonts.uiBold, fontSize: 15 },
  go: { fontFamily: fonts.uiBold, fontSize: 14 },
  footer: { fontFamily: fonts.ui, fontSize: 13, textAlign: "center", textDecorationLine: "underline", marginTop: 6 },
});
