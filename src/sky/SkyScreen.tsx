import { useFont } from "@shopify/react-native-skia";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  IOSReferenceFrame,
  SensorType,
  runOnJS,
  useAnimatedReaction,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toHorizontal } from "@/astro/coords";
import { sun } from "@/astro/solar";
import { julianDay } from "@/astro/time";
import { useSatellites } from "@/state/data";
import { skyTime, usePalette, useSky } from "@/state/store";
import { fonts } from "@/ui/theme";
import { bodiesAt, type LiveBody } from "./bodies";
import { catalogFor } from "./catalog";
import { deviceToEnu, lookAt, pointing, turnNorth, type Mat3 } from "./engine";
import { InfoCard } from "./InfoCard";
import { pick, type Picked } from "./pick";
import type { SkyTarget } from "./SkyCanvas";
import { SkyCanvas } from "./SkyCanvas";
import { SkyControls } from "./SkyControls";

/**
 * The sky's colour for the Sun's altitude: day blue, the gold and violet
 * of twilight, then the ink of night. Also how faint a star can be seen.
 */
function daylight(sunAlt: number, red: boolean): { top: string; low: string; limit: number } {
  if (red) return { top: "#0b0303", low: "#1a0606", limit: sunAlt > -6 ? 1.5 : sunAlt > -12 ? 4 : 6 };
  if (sunAlt > 4) return { top: "#1d4f8f", low: "#6c9bd0", limit: -1.6 };
  if (sunAlt > -2) return { top: "#23417a", low: "#d99a6c", limit: 0 };
  if (sunAlt > -6) return { top: "#1b2d5c", low: "#8a5d78", limit: 1.8 };
  if (sunAlt > -12) return { top: "#111d42", low: "#2c3566", limit: 3.8 };
  if (sunAlt > -18) return { top: "#0c1430", low: "#1a2550", limit: 5.2 };
  return { top: "#0a0f24", low: "#18244a", limit: 6 };
}

export function SkyScreen() {
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height - 80 });
  const { width, height } = size;
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const router = useRouter();
  const s = useSky();
  const satellites = useSatellites();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [cameraPermission, requestCamera] = useCameraPermissions();

  // Fonts for the canvas: IM Fell for constellations, Hanken for the rest.
  const labelFont = useFont(require("@expo-google-fonts/im-fell-english/400Regular_Italic/IMFellEnglish_400Regular_Italic.ttf"), 15);
  const nameFont = useFont(require("@expo-google-fonts/hanken-grotesk/400Regular/HankenGrotesk_400Regular.ttf"), 11);
  const smallFont = useFont(require("@expo-google-fonts/hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf"), 12);

  const catalog = useMemo(() => catalogFor(julianDay(new Date())), []);

  // The phone's orientation, if it has the sensors (a phone, not a browser).
  const sensor = useAnimatedSensor(SensorType.ROTATION, {
    interval: "auto",
    iosReferenceFrame: IOSReferenceFrame.XTrueNorthZVertical,
    adjustToInterfaceOrientation: false,
  });
  const hasSensor = Platform.OS !== "web" && sensor.isAvailable;
  const mode = hasSensor ? s.mode : "manual";

  // Shared state the canvas reads on the UI thread.
  const device = useSharedValue<Mat3>(lookAt(s.view.az, s.view.alt));
  const fov = useSharedValue(s.fov);
  const clock = useSharedValue(0);
  const lat = useSharedValue(s.place.lat);
  const lon = useSharedValue(s.place.lon);
  const bodies = useSharedValue<LiveBody[]>([]);
  const limit = useSharedValue(-1.5);
  const skyTop = useSharedValue("#0a0f24");
  const skyLow = useSharedValue("#18244a");
  const layers = useSharedValue({ lines: s.showLines, labels: s.showLabels, grid: s.showGrid, red: s.redMode, camera: s.camera });
  const target = useSharedValue<SkyTarget | null>(null);
  const viewAz = useSharedValue(s.view.az);
  const viewAlt = useSharedValue(s.view.alt);
  const sensorMode = useSharedValue(mode === "sensor");
  const yaw = useSharedValue(s.declination + s.yawNudge);
  const smooth = useSharedValue([0, 0, 0, 1]);
  const timeOffset = useSharedValue(s.timeOffset);
  useEffect(() => {
    timeOffset.set(s.timeOffset);
  }, [s.timeOffset, timeOffset]);
  const limitTarget = useRef(6);

  useEffect(() => {
    lat.set(s.place.lat);
    lon.set(s.place.lon);
  }, [s.place, lat, lon]);
  useEffect(() => {
    layers.set({ lines: s.showLines, labels: s.showLabels, grid: s.showGrid, red: s.redMode, camera: s.camera });
  }, [s.showLines, s.showLabels, s.showGrid, s.redMode, s.camera, layers]);
  useEffect(() => {
    sensorMode.set(mode === "sensor");
    yaw.set(s.declination + s.yawNudge);
  }, [mode, s.declination, s.yawNudge, sensorMode, yaw]);

  // Every frame: advance the clock, smooth the sensor, rebuild the view.
  useFrameCallback(() => {
    "worklet";
    clock.set(Date.now() + timeOffset.value);
    if (sensorMode.value) {
      const q = sensor.sensor.value;
      const p = smooth.value;
      // Nudge the smoothed quaternion a third of the way each frame,
      // taking the short way round.
      const dot = p[0]! * q.qx + p[1]! * q.qy + p[2]! * q.qz + p[3]! * q.qw;
      const sgn = dot < 0 ? -1 : 1;
      const k = 0.33;
      const n = [
        p[0]! + (sgn * q.qx - p[0]!) * k,
        p[1]! + (sgn * q.qy - p[1]!) * k,
        p[2]! + (sgn * q.qz - p[2]!) * k,
        p[3]! + (sgn * q.qw - p[3]!) * k,
      ];
      const len = Math.hypot(n[0]!, n[1]!, n[2]!, n[3]!) || 1;
      smooth.set([n[0]! / len, n[1]! / len, n[2]! / len, n[3]! / len]);
      const m = smooth.value;
      device.set(turnNorth(deviceToEnu(m[0]!, m[1]!, m[2]!, m[3]!), yaw.value));
    } else {
      device.set(lookAt(viewAz.value, viewAlt.value));
    }
  });

  // The moving things and the daylight, recomputed on the JS side.
  useEffect(() => {
    const update = () => {
      const date = skyTime(useSky.getState().timeOffset);
      const obs = useSky.getState().place;
      bodies.set(bodiesAt(date, obs, satellites));
      const jd = julianDay(date);
      const alt = toHorizontal(sun(jd), obs, jd).alt;
      const d = daylight(alt, useSky.getState().redMode);
      skyTop.set(d.top);
      skyLow.set(d.low);
      if (limitTarget.current !== d.limit) {
        limitTarget.current = d.limit;
        limit.set(withTiming(d.limit, { duration: 1200 }));
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [satellites, s.place, s.timeOffset, s.redMode, bodies, skyTop, skyLow, limit]);

  // The eye adjusting to the dark, once on opening: stars appear brightest
  // first. Not on every time step or layer change, or the sky blinks.
  useEffect(() => {
    limit.set(-1.5);
    limit.set(withTiming(limitTarget.current, { duration: 3200 }));
  }, [limit]);

  // The target, from the Find tab, as a vector.
  useEffect(() => {
    const t = s.target;
    if (!t) {
      target.set(null);
      return;
    }
    if (t.kind === "star" || t.kind === "constellation") {
      const idx = Number(t.id);
      if (t.kind === "star") {
        target.set({ x: catalog.stars[idx * 3]!, y: catalog.stars[idx * 3 + 1]!, z: catalog.stars[idx * 3 + 2]!, frame: "eq", name: t.name });
      } else {
        const l = catalog.labels.find((c) => c.id === t.id);
        if (l) target.value = { x: l.x, y: l.y, z: l.z, frame: "eq", name: t.name };
      }
      return;
    }
    const follow = () => {
      const b = bodies.value.find((x) => x.id === t.id);
      if (b) target.value = { x: b.x, y: b.y, z: b.z, frame: "enu", name: t.name };
    };
    follow();
    const id = setInterval(follow, 1000);
    return () => clearInterval(id);
  }, [s.target, catalog, bodies, target]);

  // A tap of the haptic engine when the target comes into the middle.
  const onTarget = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  useAnimatedReaction(
    () => {
      const t = target.value;
      if (!t) return false;
      const d = device.value;
      // The camera direction in ENU is minus the device's third column.
      const c = [-d[2]!, -d[5]!, -d[8]!];
      let v = [t.x, t.y, t.z];
      if (t.frame === "eq") {
        const jd = clock.value / 86400000 + 2440587.5;
        const g = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
        const st = ((g + lon.value) * Math.PI) / 180;
        const la = (lat.value * Math.PI) / 180;
        const ct = Math.cos(st), sn = Math.sin(st), cl = Math.cos(la), sl = Math.sin(la);
        v = [-sn * t.x + ct * t.y, -sl * ct * t.x - sl * sn * t.y + cl * t.z, cl * ct * t.x + cl * sn * t.y + sl * t.z];
      }
      return c[0]! * v[0]! + c[1]! * v[1]! + c[2]! * v[2]! > Math.cos((3 * Math.PI) / 180);
    },
    (now, before) => {
      if (now && !before) runOnJS(onTarget)();
    },
  );

  // Gestures: drag to look (and leave sensor mode), pinch to zoom, tap to ask.
  const startView = useSharedValue({ az: 0, alt: 0 });
  const startFov = useSharedValue(68);
  const goManual = (az: number, alt: number) => useSky.getState().set({ mode: "manual", view: { az, alt } });
  const saveView = (az: number, alt: number, f: number) => useSky.getState().set({ view: { az, alt }, fov: f });
  const pan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      "worklet";
      if (sensorMode.value) {
        const p = pointing(device.value);
        viewAz.set(p.az);
        viewAlt.set(p.alt);
        sensorMode.set(false);
        runOnJS(goManual)(p.az, p.alt);
      }
      startView.set({ az: viewAz.value, alt: viewAlt.value });
    })
    .onUpdate((e) => {
      "worklet";
      const degPerPx = fov.value / height;
      viewAz.set((((startView.value.az - e.translationX * degPerPx) % 360) + 360) % 360);
      viewAlt.set(Math.max(-30, Math.min(89, startView.value.alt + e.translationY * degPerPx)));
    })
    .onEnd(() => {
      "worklet";
      runOnJS(saveView)(viewAz.value, viewAlt.value, fov.value);
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      "worklet";
      startFov.set(fov.value);
    })
    .onUpdate((e) => {
      "worklet";
      fov.set(Math.max(18, Math.min(105, startFov.value / e.scale)));
    })
    .onEnd(() => {
      "worklet";
      runOnJS(saveView)(viewAz.value, viewAlt.value, fov.value);
    });
  const onTap = (x: number, y: number) => {
    const found = pick(
      x,
      y,
      { device: device.value, fov: fov.value, clock: clock.value, lat: lat.value, lon: lon.value, width, height, limit: limit.value },
      catalog,
      bodies.value,
    );
    setPicked(found);
    if (found) Haptics.selectionAsync().catch(() => {});
  };
  const tap = Gesture.Tap().onEnd((e) => {
    "worklet";
    runOnJS(onTap)(e.x, e.y);
  });
  const gestures = Gesture.Simultaneous(pan, pinch, tap);

  const recenter = () => {
    if (hasSensor) {
      useSky.getState().set({ mode: "sensor" });
      sensorMode.set(true);
    }
  };

  return (
    <View
      style={[styles.root, { backgroundColor: palette.sky }]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {s.camera && cameraPermission?.granted && Platform.OS !== "web" && <CameraView style={StyleSheet.absoluteFill} facing="back" />}
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill}>
          <SkyCanvas
            width={width}
            height={height}
            catalog={catalog}
            inputs={{ device, fov, clock, lat, lon, bodies, limit, skyTop, skyLow, layers, target }}
            labelFont={labelFont}
            nameFont={nameFont}
            smallFont={smallFont}
          />
        </View>
      </GestureDetector>

      <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.push("/place")} hitSlop={10}>
          <Text style={[styles.place, { color: palette.ink }]}>{s.place.name}</Text>
          <Text style={[styles.sub, { color: palette.soft }]}>
            {s.timeOffset === 0 ? "Now" : skyTime(s.timeOffset).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            {mode === "manual" && hasSensor ? ", moved by hand" : ""}
          </Text>
        </Pressable>
        {s.target && (
          <Pressable onPress={() => s.set({ target: null })} style={[styles.chip, { borderColor: palette.panelLine }]}>
            <Text style={[styles.chipText, { color: palette.ink }]}>Finding {s.target.name}  ✕</Text>
          </Pressable>
        )}
      </View>

      <SkyControls
        hasSensor={hasSensor}
        mode={mode}
        onRecenter={recenter}
        onCamera={async () => {
          if (!s.camera && !cameraPermission?.granted) {
            const r = await requestCamera();
            if (!r.granted) return;
          }
          s.set({ camera: !s.camera });
        }}
      />

      {picked && (
        <InfoCard
          picked={picked}
          bodies={bodies.value}
          onClose={() => setPicked(null)}
          onFind={(t) => {
            s.set({ target: t });
            setPicked(null);
          }}
        />
      )}
      {!s.onboarded && hasSensor && (
        <View style={[styles.hint, { backgroundColor: palette.panel, borderColor: palette.panelLine, bottom: 150 }]}>
          <Text style={[styles.hintTitle, { color: palette.ink }]}>Hold your phone up to the sky</Text>
          <Text style={[styles.hintBody, { color: palette.soft }]}>
            Asterism follows where you point it. Drag to look around by hand, pinch to zoom, tap anything to find out what it is.
          </Text>
          <Pressable onPress={() => s.set({ onboarded: true })} style={[styles.hintButton, { backgroundColor: palette.ink }]}>
            <Text style={[styles.hintButtonText, { color: palette.sky }]}>Got it</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  place: { fontFamily: fonts.display, fontSize: 26 },
  sub: { fontFamily: fonts.ui, fontSize: 13, marginTop: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(10,15,36,0.7)" },
  chipText: { fontFamily: fonts.uiMedium, fontSize: 13 },
  hint: { position: "absolute", left: 16, right: 16, borderWidth: 1, borderRadius: 18, padding: 18 },
  hintTitle: { fontFamily: fonts.display, fontSize: 22 },
  hintBody: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21, marginTop: 6 },
  hintButton: { alignSelf: "flex-start", marginTop: 14, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  hintButtonText: { fontFamily: fonts.uiBold, fontSize: 15 },
});
