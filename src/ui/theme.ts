// Asterism looks like a plate from an old star atlas: deep ink-blue night,
// constellation figures in engraver's gold, parchment for the stars and
// the text. Night vision swaps every colour for dim red, which keeps the
// eye's rods dark-adapted the way astronomers' red torches do.

export interface Palette {
  sky: string;
  skyHorizon: string;
  ground: string;
  panel: string;
  panelLine: string;
  ink: string; // primary text
  soft: string; // secondary text
  gold: string; // constellations, accents
  star: string;
  planet: string;
  satellite: string;
  danger: string;
}

export const night: Palette = {
  sky: "#0a0f24",
  skyHorizon: "#18244a",
  ground: "#06060b",
  panel: "rgba(12, 17, 38, 0.92)",
  panelLine: "rgba(212, 177, 106, 0.22)",
  ink: "#efe4c8",
  soft: "rgba(239, 228, 200, 0.62)",
  gold: "#d4b16a",
  star: "#f4ecd8",
  planet: "#f0c987",
  satellite: "#9fd4ff",
  danger: "#ff7a6b",
};

export const red: Palette = {
  sky: "#0b0303",
  skyHorizon: "#1a0606",
  ground: "#040101",
  panel: "rgba(20, 4, 4, 0.94)",
  panelLine: "rgba(255, 70, 51, 0.25)",
  ink: "#ff5a45",
  soft: "rgba(255, 90, 69, 0.6)",
  gold: "#c8392a",
  star: "#ff6a52",
  planet: "#ff7a5c",
  satellite: "#ff5a45",
  danger: "#ff5a45",
};

export const fonts = {
  // IM Fell English: cut in the 1670s and revived by Igino Marini; the
  // type of the era's star atlases.
  display: "IMFellEnglish_400Regular",
  displayItalic: "IMFellEnglish_400Regular_Italic",
  ui: "HankenGrotesk_400Regular",
  uiMedium: "HankenGrotesk_500Medium",
  uiBold: "HankenGrotesk_600SemiBold",
};

/** Star colour from its B−V colour index: blue-white hot stars to orange cool ones. */
export function starColor(bv: number, redMode: boolean): string {
  if (redMode) return red.star;
  const stops: [number, [number, number, number]][] = [
    [-0.3, [170, 191, 255]],
    [0.0, [202, 216, 255]],
    [0.4, [248, 247, 255]],
    [0.8, [255, 244, 234]],
    [1.2, [255, 222, 180]],
    [1.6, [255, 196, 140]],
    [2.0, [255, 170, 110]],
  ];
  if (bv <= stops[0]![0]) return rgb(stops[0]![1]);
  for (let i = 1; i < stops.length; i++) {
    const [b1, c1] = stops[i]!;
    const [b0, c0] = stops[i - 1]!;
    if (bv <= b1) {
      const t = (bv - b0) / (b1 - b0);
      return rgb([0, 1, 2].map((k) => c0[k]! + (c1[k]! - c0[k]!) * t) as [number, number, number]);
    }
  }
  return rgb(stops[stops.length - 1]![1]);
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
