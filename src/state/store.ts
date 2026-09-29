import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { night, red, type Palette } from "@/ui/theme";

export interface Place {
  lat: number;
  lon: number;
  name: string;
  source: "gps" | "chosen";
}

// Dhaka until the phone tells us where we are.
const FALLBACK: Place = { lat: 23.8103, lon: 90.4125, name: "Dhaka", source: "chosen" };

export type Target = { kind: "star" | "planet" | "moon" | "sun" | "constellation" | "satellite"; id: string; name: string } | null;

interface State {
  place: Place;
  /** Offset from real time, ms: the time-travel dial. */
  timeOffset: number;
  /** Follow the phone's motion, or drag the sky by hand. */
  mode: "sensor" | "manual";
  /** Where a hand-dragged view points: azimuth and altitude, degrees. */
  view: { az: number; alt: number };
  /** Vertical field of view, degrees: pinch to zoom. */
  fov: number;
  /** A correction to the compass the user can drag in, degrees. */
  yawNudge: number;
  /** Magnetic declination at the place, degrees east (Android reports magnetic north). */
  declination: number;
  redMode: boolean;
  camera: boolean;
  showLines: boolean;
  showGrid: boolean;
  showLabels: boolean;
  target: Target;
  onboarded: boolean;

  set: (s: Partial<State>) => void;
}

export const useSky = create<State>()(
  persist(
    (set) => ({
      place: FALLBACK,
      timeOffset: 0,
      mode: "sensor",
      view: { az: 180, alt: 22 },
      fov: 68,
      yawNudge: 0,
      declination: 0,
      redMode: false,
      camera: false,
      showLines: true,
      showGrid: false,
      showLabels: true,
      target: null,
      onboarded: false,
      set: (s) => set(s),
    }),
    {
      name: "asterism",
      storage: createJSONStorage(() => AsyncStorage),
      // Time travel and the current target don't survive a restart.
      partialize: ({ timeOffset: _t, target: _g, set: _s, ...rest }) => rest,
    },
  ),
);

export function usePalette(): Palette {
  return useSky((s) => (s.redMode ? red : night));
}

/** The moment the sky is showing. */
export function skyTime(offset: number): Date {
  return new Date(Date.now() + offset);
}
