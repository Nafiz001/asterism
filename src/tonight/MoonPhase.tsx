import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";

/** The Moon as it looks tonight: the lit part, and faint earthshine on the rest. */
export function MoonPhase({ size, illumination, waxing, red }: { size: number; illumination: number; waxing: boolean; red: boolean }) {
  const r = size / 2 - 6;
  const c = size / 2;
  const path = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    // In the northern sky a waxing Moon is lit on the right.
    const side = waxing ? 1 : -1;
    const w = r * Math.abs(1 - 2 * illumination);
    for (let s = 0; s <= 48; s++) {
      const t = -Math.PI / 2 + (Math.PI * s) / 48;
      const x = c + side * r * Math.cos(t);
      const y = c + r * Math.sin(t);
      if (s === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    for (let s = 48; s >= 0; s--) {
      const t = -Math.PI / 2 + (Math.PI * s) / 48;
      const ex = (illumination > 0.5 ? -w : w) * Math.cos(t) * side;
      p.lineTo(c + ex, c + r * Math.sin(t));
    }
    p.close();
    return p.build();
  }, [r, c, illumination, waxing]);
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={c} cy={c} r={r + 4} color={red ? "rgba(255,90,69,0.12)" : "rgba(243,236,214,0.12)"} />
      <Circle cx={c} cy={c} r={r} color={red ? "#2a0806" : "#262c48"} />
      <Path path={path} color={red ? "#ff6a52" : "#f3ecd6"} />
      <Circle cx={c} cy={c} r={r} color={red ? "rgba(255,90,69,0.25)" : "rgba(243,236,214,0.18)"} style="stroke" strokeWidth={1} />
    </Canvas>
  );
}
