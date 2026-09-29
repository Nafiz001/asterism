import { BlurStyle, Canvas, PaintStyle, Picture, Skia, TileMode, type SkFont, vec } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import type { LiveBody } from "./bodies";
import type { Catalog } from "./catalog";
import { DEG, enuVector, equatorialToEnu, julianNow, mul, project, siderealDeg, transpose, type Mat3 } from "./engine";

export interface SkyTarget {
  x: number;
  y: number;
  z: number;
  frame: "eq" | "enu";
  name: string;
}

export interface SkyInputs {
  /** Device → East-North-Up. */
  device: SharedValue<Mat3>;
  fov: SharedValue<number>;
  /** Milliseconds since the epoch the sky is showing. */
  clock: SharedValue<number>;
  lat: SharedValue<number>;
  lon: SharedValue<number>;
  bodies: SharedValue<LiveBody[]>;
  /** Faintest magnitude drawn: the eye's adaptation and the daylight. */
  limit: SharedValue<number>;
  /** Sky colours, top and horizon. */
  skyTop: SharedValue<string>;
  skyLow: SharedValue<string>;
  layers: SharedValue<{ lines: boolean; labels: boolean; grid: boolean; red: boolean; camera: boolean }>;
  target: SharedValue<SkyTarget | null>;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function SkyCanvas({
  width,
  height,
  catalog,
  inputs,
  labelFont,
  nameFont,
  smallFont,
}: {
  width: number;
  height: number;
  catalog: Catalog;
  inputs: SkyInputs;
  labelFont: SkFont | null;
  nameFont: SkFont | null;
  smallFont: SkFont | null;
}) {
  const { stars, mag, colors, redColors, names, lines, labels } = catalog;
  const recorder = Skia.PictureRecorder();

  const picture = useDerivedValue(() => {
    "worklet";
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const L = inputs.layers.value;
    const red = L.red;
    const gold = Skia.Color(red ? "#c8392a" : "#d4b16a");
    const ink = Skia.Color(red ? "#ff5a45" : "#efe4c8");
    const fov = inputs.fov.value;
    const f = height / 2 / Math.tan((fov / 2) * DEG);
    const device = inputs.device.value;
    const deviceT = transpose(device);
    const jd = julianNow(inputs.clock.value);
    const lst = siderealDeg(jd) + inputs.lon.value;
    const eqToDev = mul(deviceT, equatorialToEnu(lst, inputs.lat.value));
    const pe = { m: eqToDev, f, cx: width / 2, cy: height / 2 };
    const pd = { m: deviceT, f, cx: width / 2, cy: height / 2 };
    const out = [0, 0];
    const out2 = [0, 0];
    const onScreen = (x: number, y: number, pad: number) => x > -pad && x < width + pad && y > -pad && y < height + pad;
    const zoom = Math.sqrt(68 / fov);
    const limit = inputs.limit.value;
    // In daylight the figures fade with the stars they join.
    const dayFade = Math.max(0.12, Math.min(1, (limit + 1.6) / 5));

    // The sky itself.
    const bg = Skia.Paint();
    if (L.camera) {
      bg.setColor(Skia.Color("rgba(4,6,16,0.35)"));
    } else {
      bg.setShader(
        Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, height), [Skia.Color(inputs.skyTop.value), Skia.Color(inputs.skyLow.value)], null, TileMode.Clamp),
      );
    }
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), bg);

    // Coordinate grid: altitude rings and azimuth spokes.
    if (L.grid) {
      const gp = Skia.Paint();
      gp.setColor(gold);
      gp.setAlphaf(0.16);
      gp.setStyle(PaintStyle.Stroke);
      gp.setStrokeWidth(1);
      gp.setAntiAlias(true);
      for (const alt of [15, 30, 45, 60, 75]) {
        const path = Skia.PathBuilder.Make();
        let pen = false;
        for (let az = 0; az <= 360; az += 3) {
          const v = enuVector(alt, az);
          if (project(pd, v[0], v[1], v[2], out)) {
            if (pen) path.lineTo(out[0]!, out[1]!);
            else path.moveTo(out[0]!, out[1]!);
            pen = true;
          } else pen = false;
        }
        canvas.drawPath(path.build(), gp);
      }
      for (let az = 0; az < 360; az += 30) {
        const path = Skia.PathBuilder.Make();
        let pen = false;
        for (let alt = 0; alt <= 85; alt += 5) {
          const v = enuVector(alt, az);
          if (project(pd, v[0], v[1], v[2], out)) {
            if (pen) path.lineTo(out[0]!, out[1]!);
            else path.moveTo(out[0]!, out[1]!);
            pen = true;
          } else pen = false;
        }
        canvas.drawPath(path.build(), gp);
      }
    }

    // Constellation figures.
    if (L.lines) {
      const lp = Skia.Paint();
      lp.setColor(gold);
      lp.setAlphaf(0.42 * dayFade);
      lp.setStyle(PaintStyle.Stroke);
      lp.setStrokeWidth(1.1);
      lp.setAntiAlias(true);
      for (let c = 0; c < lines.length; c++) {
        const chain = lines[c]!;
        for (let k = 0; k + 5 < chain.length; k += 3) {
          const a = project(pe, chain[k]!, chain[k + 1]!, chain[k + 2]!, out);
          const b = project(pe, chain[k + 3]!, chain[k + 4]!, chain[k + 5]!, out2);
          if (a && b && (onScreen(out[0]!, out[1]!, 400) || onScreen(out2[0]!, out2[1]!, 400))) {
            canvas.drawLine(out[0]!, out[1]!, out2[0]!, out2[1]!, lp);
          }
        }
      }
    }

    // Stars, brightest first, down to the limit.
    const sp = Skia.Paint();
    sp.setAntiAlias(true);
    const glow = Skia.Paint();
    glow.setAntiAlias(true);
    const starLabelBelow = 1.4 + (68 - fov) / 22;
    const n = mag.length;
    for (let i = 0; i < n; i++) {
      const m = mag[i]!;
      if (m > limit) break;
      if (!project(pe, stars[i * 3]!, stars[i * 3 + 1]!, stars[i * 3 + 2]!, out)) continue;
      const x = out[0]!, y = out[1]!;
      if (!onScreen(x, y, 20)) continue;
      const r = Math.max(0.55, Math.min(4.6, (limit - m) * 0.52 + 0.5)) * zoom;
      const alpha = Math.max(0, Math.min(1, (limit - m) / 1.1));
      const c = red ? redColors[i]! : colors[i]!;
      if (m < 1.8) {
        glow.setColor(c);
        glow.setAlphaf(0.28 * alpha);
        glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r * 2.2, true));
        canvas.drawCircle(x, y, r * 2.4, glow);
      }
      sp.setColor(c);
      sp.setAlphaf(alpha);
      canvas.drawCircle(x, y, r, sp);
      if (L.labels && nameFont && m < starLabelBelow && names[i]) {
        const tp = Skia.Paint();
        tp.setColor(ink);
        tp.setAlphaf(0.62 * alpha);
        canvas.drawText(names[i]!, x + r + 5, y + 4, tp, nameFont);
      }
    }

    // Constellation names, in the atlas's italic.
    if (L.labels && labelFont) {
      const tp = Skia.Paint();
      tp.setColor(gold);
      tp.setAlphaf(0.78 * dayFade);
      const maxRank = fov > 80 ? 1 : fov > 50 ? 2 : 3;
      for (let k = 0; k < labels.length; k++) {
        const l = labels[k]!;
        if (l.rank > maxRank) continue;
        if (!project(pe, l.x, l.y, l.z, out) || !onScreen(out[0]!, out[1]!, 0)) continue;
        const w = labelFont.getTextWidth(l.name);
        canvas.drawText(l.name, out[0]! - w / 2, out[1]!, tp, labelFont);
      }
    }

    // The Sun, the Moon, planets and satellites.
    const bodies = inputs.bodies.value;
    let sunV: number[] | null = null;
    for (let b = 0; b < bodies.length; b++) if (bodies[b]!.kind === "sun") sunV = [bodies[b]!.x, bodies[b]!.y, bodies[b]!.z];
    const bp = Skia.Paint();
    bp.setAntiAlias(true);
    const tp = Skia.Paint();
    tp.setAntiAlias(true);
    for (let b = 0; b < bodies.length; b++) {
      const o = bodies[b]!;
      if (o.kind === "satellite") {
        // The path ahead, dotted.
        const path = o.path ?? [];
        bp.setColor(Skia.Color(red ? "#ff5a45" : "#9fd4ff"));
        for (let k = 0; k + 2 < path.length; k += 3) {
          if (project(pd, path[k]!, path[k + 1]!, path[k + 2]!, out)) {
            bp.setAlphaf(0.5 - k * 0.02);
            canvas.drawCircle(out[0]!, out[1]!, 1.4, bp);
          }
        }
      }
      if (!project(pd, o.x, o.y, o.z, out) || !onScreen(out[0]!, out[1]!, 60)) continue;
      const x = out[0]!, y = out[1]!;
      if (o.kind === "sun") {
        const r = Math.max(10, 0.27 * DEG * f);
        bp.setColor(Skia.Color(red ? "#ff5a45" : "#fff3c4"));
        bp.setAlphaf(0.25);
        bp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r * 1.6, true));
        canvas.drawCircle(x, y, r * 3, bp);
        bp.setMaskFilter(null);
        bp.setAlphaf(1);
        canvas.drawCircle(x, y, r, bp);
      } else if (o.kind === "moon") {
        const r = Math.max(11, 0.26 * DEG * f);
        // Which way the Sun is from the Moon, on screen.
        let ang = -Math.PI / 2;
        if (sunV) {
          const t = [o.x + 0.04 * (sunV[0]! - o.x), o.y + 0.04 * (sunV[1]! - o.y), o.z + 0.04 * (sunV[2]! - o.z)];
          if (project(pd, t[0]!, t[1]!, t[2]!, out2)) ang = Math.atan2(out2[1]! - y, out2[0]! - x);
        }
        bp.setMaskFilter(null);
        bp.setColor(Skia.Color(red ? "#2a0806" : "#2b3150"));
        bp.setAlphaf(0.85);
        canvas.drawCircle(x, y, r, bp); // earthshine
        const k = o.illumination ?? 1;
        const w = r * Math.abs(1 - 2 * k);
        const lit = Skia.PathBuilder.Make();
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const pt = (px: number, py: number) => [x + px * ca - py * sa, y + px * sa + py * ca];
        for (let s = 0; s <= 24; s++) {
          const t = -Math.PI / 2 + (Math.PI * s) / 24;
          const p = pt(r * Math.cos(t), r * Math.sin(t));
          if (s === 0) lit.moveTo(p[0]!, p[1]!);
          else lit.lineTo(p[0]!, p[1]!);
        }
        for (let s = 24; s >= 0; s--) {
          const t = -Math.PI / 2 + (Math.PI * s) / 24;
          const ex = (k > 0.5 ? -w : w) * Math.cos(t);
          const p = pt(ex, r * Math.sin(t));
          lit.lineTo(p[0]!, p[1]!);
        }
        lit.close();
        bp.setColor(Skia.Color(red ? "#ff6a52" : "#f3ecd6"));
        bp.setAlphaf(1);
        canvas.drawPath(lit.build(), bp);
        bp.setAlphaf(0.18);
        bp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r, true));
        canvas.drawCircle(x, y, r * 1.8, bp);
        bp.setMaskFilter(null);
      } else {
        const planet = o.kind === "planet";
        if (planet && o.mag > limit + 1) continue;
        if (!planet && !o.sunlit && limit > 3) {
          // In the Earth's shadow: there, but dark.
          bp.setColor(Skia.Color(red ? "#ff5a45" : "#9fd4ff"));
          bp.setAlphaf(0.35);
          bp.setStyle(PaintStyle.Stroke);
          bp.setStrokeWidth(1);
          canvas.drawCircle(x, y, 3.5, bp);
          bp.setStyle(PaintStyle.Fill);
        } else {
          const r = planet ? Math.max(2.6, Math.min(6, 3.4 - o.mag * 0.45)) * zoom : 3.2;
          bp.setColor(Skia.Color(red ? "#ff7a5c" : planet ? "#f0c987" : "#9fd4ff"));
          bp.setAlphaf(0.3);
          bp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r * 1.8, true));
          canvas.drawCircle(x, y, r * 2.2, bp);
          bp.setMaskFilter(null);
          bp.setAlphaf(1);
          canvas.drawCircle(x, y, r, bp);
        }
      }
      if (smallFont) {
        tp.setColor(Skia.Color(red ? "#ff5a45" : o.kind === "satellite" ? "#9fd4ff" : "#f0c987"));
        tp.setAlphaf(0.9);
        const lift = o.kind === "moon" || o.kind === "sun" ? Math.max(14, 0.3 * DEG * f) : 8;
        canvas.drawText(o.name, x + lift, y - lift * 0.4, tp, smallFont);
      }
    }

    // The ground: everything below the horizon, and the compass points on it.
    const center = [-device[2]!, -device[5]!, -device[8]!];
    const viewAz = Math.atan2(center[0]!, center[1]!) / DEG;
    const ground = Skia.PathBuilder.Make();
    const horizon: number[] = [];
    for (let s = -90; s <= 90; s += 2) {
      const v = enuVector(0, viewAz + s);
      if (project(pd, v[0], v[1], v[2], out)) horizon.push(out[0]!, out[1]!);
    }
    const gp = Skia.Paint();
    gp.setAntiAlias(true);
    if (horizon.length >= 4) {
      // Close the band far away on the ground's side: towards the nadir.
      const nadir = enuVector(-60, viewAz);
      let dx = 0, dy = 1;
      if (project(pd, nadir[0], nadir[1], nadir[2], out2)) {
        const hx = horizon[Math.floor(horizon.length / 4) * 2]!, hy = horizon[Math.floor(horizon.length / 4) * 2 + 1]!;
        const len = Math.hypot(out2[0]! - hx, out2[1]! - hy) || 1;
        dx = (out2[0]! - hx) / len;
        dy = (out2[1]! - hy) / len;
      }
      ground.moveTo(horizon[0]!, horizon[1]!);
      for (let k = 2; k < horizon.length; k += 2) ground.lineTo(horizon[k]!, horizon[k + 1]!);
      for (let k = horizon.length - 2; k >= 0; k -= 2) ground.lineTo(horizon[k]! + dx * 6000, horizon[k + 1]! + dy * 6000);
      ground.close();
      gp.setColor(Skia.Color(red ? "#040101" : "#07070d"));
      gp.setAlphaf(L.camera ? 0.45 : 0.97);
      canvas.drawPath(ground.build(), gp);
      // A faint glow along the horizon: the lights of the town.
      const hp = Skia.Paint();
      hp.setAntiAlias(true);
      hp.setStyle(PaintStyle.Stroke);
      hp.setStrokeWidth(1.2);
      hp.setColor(gold);
      hp.setAlphaf(0.55);
      const line = Skia.PathBuilder.Make();
      line.moveTo(horizon[0]!, horizon[1]!);
      for (let k = 2; k < horizon.length; k += 2) line.lineTo(horizon[k]!, horizon[k + 1]!);
      canvas.drawPath(line.build(), hp);
    } else if (center[2]! < 0) {
      gp.setColor(Skia.Color(red ? "#040101" : "#07070d"));
      gp.setAlphaf(L.camera ? 0.45 : 0.97);
      canvas.drawRect(Skia.XYWHRect(0, 0, width, height), gp);
    }
    if (labelFont) {
      const cp = Skia.Paint();
      cp.setColor(gold);
      for (let k = 0; k < 8; k++) {
        const v = enuVector(0, k * 45);
        if (!project(pd, v[0], v[1], v[2], out) || !onScreen(out[0]!, out[1]!, 0)) continue;
        const label = CARDINALS[k]!;
        const w = labelFont.getTextWidth(label);
        cp.setAlphaf(k % 2 === 0 ? 1 : 0.6);
        canvas.drawText(label, out[0]! - w / 2, out[1]! + 26, cp, labelFont);
      }
    }

    // The target: a ring when it's in view, an arrow at the edge when not.
    const tg = inputs.target.value;
    if (tg) {
      const p = tg.frame === "eq" ? pe : pd;
      const m = p.m;
      const dx = m[0]! * tg.x + m[1]! * tg.y + m[2]! * tg.z;
      const dy = m[3]! * tg.x + m[4]! * tg.y + m[5]! * tg.z;
      const inFront = project(p, tg.x, tg.y, tg.z, out) && onScreen(out[0]!, out[1]!, -30);
      const rp = Skia.Paint();
      rp.setAntiAlias(true);
      rp.setColor(ink);
      if (inFront) {
        rp.setStyle(PaintStyle.Stroke);
        rp.setStrokeWidth(1.5);
        canvas.drawCircle(out[0]!, out[1]!, 22, rp);
        canvas.drawCircle(out[0]!, out[1]!, 28, rp);
      } else {
        const a = Math.atan2(-dy, dx);
        const rx = width / 2 - 44, ry = height / 2 - 150;
        const ax = width / 2 + rx * Math.cos(a), ay = height / 2 + ry * Math.sin(a);
        const arrow = Skia.PathBuilder.Make();
        arrow.moveTo(ax + 16 * Math.cos(a), ay + 16 * Math.sin(a));
        arrow.lineTo(ax + 10 * Math.cos(a + 2.4), ay + 10 * Math.sin(a + 2.4));
        arrow.lineTo(ax + 10 * Math.cos(a - 2.4), ay + 10 * Math.sin(a - 2.4));
        arrow.close();
        canvas.drawPath(arrow.build(), rp);
        if (smallFont) {
          const w = smallFont.getTextWidth(tg.name);
          canvas.drawText(tg.name, ax - w / 2 - 20 * Math.cos(a), ay - 20 * Math.sin(a) + 4, rp, smallFont);
        }
      }
    }

    return recorder.finishRecordingAsPicture();
  });

  return (
    <Canvas style={{ position: "absolute", left: 0, top: 0, width, height }} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}
