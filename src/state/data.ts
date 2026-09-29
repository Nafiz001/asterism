import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { parseTle, toSatellite, type Satellite } from "@/astro/satellites";
import { useSky } from "./store";

// Things the app fetches: satellite orbits, the weather, where you are.
// Each is cached so the sky works offline and CelesTrak isn't asked twice
// in an afternoon.

async function cached<T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T | null> {
  let stale: T | null = null;
  try {
    const hit = await AsyncStorage.getItem(key);
    if (hit) {
      const { at, value } = JSON.parse(hit) as { at: number; value: T };
      if (Date.now() - at < maxAgeMs) return value;
      stale = value;
    }
  } catch {}
  try {
    const value = await load();
    AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), value })).catch(() => {});
    return value;
  } catch {
    return stale;
  }
}

// The space stations, always; and the brightest other satellites.
const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle";
const KEEP = /^(ISS \(ZARYA\)|CSS \(TIANHE\)|TIANGONG)/;

/** The satellites, and whether their orbits couldn't be fetched (nor were cached). */
export function useSatellites(): { satellites: Satellite[]; failed: boolean } {
  const [sats, setSats] = useState<Satellite[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    cached("tle:stations", 12 * 3600_000, async () => {
      const res = await fetch(TLE_URL);
      if (!res.ok) throw new Error(`CelesTrak ${res.status}`);
      return res.text();
    }).then((text) => {
      if (!text) {
        setFailed(true);
        return;
      }
      const list = parseTle(text)
        .filter((t) => KEEP.test(t.name))
        .map(toSatellite)
        .filter((s): s is Satellite => !!s)
        .map((s) => ({ ...s, name: s.name.startsWith("ISS") ? "ISS" : "Tiangong" }));
      setSats(list);
    });
  }, []);
  return { satellites: sats, failed };
}

export interface HourForecast {
  time: string; // ISO local hour
  cloud: number; // 0..100
  cloudLow: number;
  humidity: number;
}

/** Hourly cloud cover for the next three days, from Open-Meteo. */
export async function forecast(lat: number, lon: number): Promise<HourForecast[] | null> {
  const key = `wx:${lat.toFixed(1)},${lon.toFixed(1)}`;
  return cached(key, 60 * 60_000, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover,cloud_cover_low,relative_humidity_2m&forecast_days=3&timezone=UTC`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const j = await res.json();
    return (j.hourly.time as string[]).map((t, i) => ({
      time: t + "Z",
      cloud: j.hourly.cloud_cover[i],
      cloudLow: j.hourly.cloud_cover_low[i],
      humidity: j.hourly.relative_humidity_2m[i],
    }));
  });
}

/**
 * Asks for the phone's location once and keeps it; on Android also reads
 * the magnetic declination there (the compass reports magnetic north).
 */
export async function locate(): Promise<"ok" | "denied" | "failed"> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return "denied";
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude: lat, longitude: lon } = pos.coords;
    let name = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    if (Platform.OS !== "web") {
      try {
        const [g] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (g?.city || g?.region) name = g.city ?? g.region ?? name;
      } catch {}
    }
    useSky.getState().set({ place: { lat, lon, name, source: "gps" } });
    if (Platform.OS === "android") {
      try {
        const h = await Location.getHeadingAsync();
        if (h.trueHeading >= 0) {
          const d = ((h.trueHeading - h.magHeading + 540) % 360) - 180;
          useSky.getState().set({ declination: d });
        }
      } catch {}
    }
    return "ok";
  } catch {
    return "failed";
  }
}

/** A few places to choose by hand, for a phone that won't share its location. */
export const CITIES = [
  { name: "Dhaka", lat: 23.8103, lon: 90.4125 },
  { name: "Chittagong", lat: 22.3569, lon: 91.7832 },
  { name: "Delhi", lat: 28.6139, lon: 77.209 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "London", lat: 51.5072, lon: -0.1276 },
  { name: "New York", lat: 40.7128, lon: -74.006 },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Cape Town", lat: -33.9249, lon: 18.4241 },
  { name: "São Paulo", lat: -23.5505, lon: -46.6333 },
];
