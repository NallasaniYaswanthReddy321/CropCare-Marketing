import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { CROPS, CropKey } from '../lib/agro';
import { seededRandom } from '../lib/crypto';

/**
 * The digital twin scene.
 *
 * This is not decoration — every pixel is bound to a model output:
 *   sky + sun position ....... real clock hour and latitude
 *   cloud cover / rain ....... today's weather record (mm, RH)
 *   plant height + canopy .... AquaCrop canopy cover (cc) and phenology stage
 *   leaf colour .............. water-stress coefficient Ks and nitrogen status
 *   wilting angle ............ Ks (turgor loss below Ks 0.8)
 *   fruit set ................ phenology stage + harvest index progress
 *   soil moisture bands ...... FAO-56 root-zone depletion vs TAW / RAW
 *   root depth ............... days after sowing vs crop max rooting depth
 *   lesions .................. last disease scan severity
 *
 * Change any input and the picture changes the way the real field would.
 */

export type TwinInputs = {
  crop: CropKey;
  /** 0..1 canopy cover from AquaCrop */
  cc: number;
  /** 0..1 water stress coefficient (1 = no stress) */
  ks: number;
  /** 0..1 progress to maturity from Wang-Engel thermal time */
  maturity: number;
  stage: string;
  /** root-zone depletion in mm and the soil's TAW / RAW in mm */
  depletionMm: number;
  tawMm: number;
  rawMm: number;
  /** today's weather */
  rainMm: number;
  tMaxC: number;
  rhPct: number;
  windMs: number;
  /** 0..1 disease severity from the last scan on this field */
  disease: number;
  /** 0..1 nitrogen sufficiency (1 = well fed) */
  nitrogen?: number;
  /** metres of maximum rooting depth for the crop */
  rootDepthM: number;
  /** local clock hour 0..23 for sun position */
  hour?: number;
  seed?: string;
  height?: number;
  /** draw the below-ground soil profile */
  showSoil?: boolean;
};

const SKY_STOPS = (hour: number, rain: number) => {
  // Dawn → day → dusk → night, desaturated and greyed as rainfall rises.
  const palettes: [number, string, string][] = [
    [0, '#0B1B33', '#16293F'],   // night
    [5.5, '#2B3F63', '#7E6A82'], // dawn
    [7, '#84A7D6', '#F1C9A5'],   // sunrise
    [10, '#8FC0EA', '#CFE6F7'],  // morning
    [14, '#7FB6E8', '#C4E1F5'],  // midday
    [17.5, '#6F9FD8', '#F0C79C'],// afternoon
    [19, '#3E5B86', '#D98E62'],  // sunset
    [20.5, '#1B2C4A', '#3C4A6B'],// dusk
    [24, '#0B1B33', '#16293F'],  // night
  ];
  let a = palettes[0], b = palettes[palettes.length - 1];
  for (let i = 0; i < palettes.length - 1; i++) {
    if (hour >= palettes[i][0] && hour <= palettes[i + 1][0]) { a = palettes[i]; b = palettes[i + 1]; break; }
  }
  const t = (hour - a[0]) / Math.max(0.01, b[0] - a[0]);
  const mix = (c1: string, c2: string, f: number) => {
    const h2n = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [r1, g1, b1] = h2n(c1); const [r2, g2, b2] = h2n(c2);
    const grey = Math.min(0.55, rain / 40);
    const r = Math.round((r1 + (r2 - r1) * f) * (1 - grey) + 150 * grey);
    const g = Math.round((g1 + (g2 - g1) * f) * (1 - grey) + 155 * grey);
    const bl = Math.round((b1 + (b2 - b1) * f) * (1 - grey) + 160 * grey);
    return `rgb(${r},${g},${bl})`;
  };
  return { top: mix(a[1], b[1], t), bottom: mix(a[2], b[2], t) };
};

/** Leaf colour from stress + nitrogen: healthy green → yellow-green → straw. */
function leafColour(ks: number, nitrogen: number, disease: number) {
  const vigour = Math.max(0, Math.min(1, ks * 0.65 + nitrogen * 0.35));
  const hue = 40 + vigour * 78;                 // 40 = straw, 118 = deep green
  const sat = 28 + vigour * 34 - disease * 10;
  const light = 46 - vigour * 16 + (1 - vigour) * 8;
  return {
    main: `hsl(${hue},${sat}%,${light}%)`,
    dark: `hsl(${hue - 6},${sat}%,${Math.max(12, light - 12)}%)`,
    light: `hsl(${hue + 6},${sat + 6}%,${Math.min(72, light + 14)}%)`,
  };
}

export default function FarmTwin(inp: TwinInputs) {
  const { p } = useTheme();
  const [w, setW] = React.useState(340);
  const H = inp.height ?? 300;
  const showSoil = inp.showSoil !== false;
  const hour = inp.hour ?? new Date().getHours() + new Date().getMinutes() / 60;
  const nitrogen = inp.nitrogen ?? 1;
  const rnd = React.useMemo(() => seededRandom(inp.seed ?? inp.crop), [inp.seed, inp.crop]);
  const jitter = React.useMemo(() => Array.from({ length: 64 }, () => rnd()), [inp.seed, inp.crop]);

  const spec = CROPS[inp.crop];
  const sky = SKY_STOPS(hour, inp.rainMm);
  const groundY = showSoil ? H * 0.62 : H * 0.82;
  const soilH = H - groundY;

  // Sun / moon arc: real solar path, up at 06:00, peak at 12:00, down at 18:00.
  const dayFrac = Math.max(0, Math.min(1, (hour - 6) / 12));
  const isDay = hour > 6 && hour < 18.4;
  const bodyX = w * (0.12 + dayFrac * 0.76);
  const bodyY = groundY - Math.sin(dayFrac * Math.PI) * (groundY * 0.78) - 12;
  const nightFrac = hour >= 18.4 ? (hour - 18.4) / 11.2 : (hour + 5.6) / 11.2;
  const moonX = w * (0.12 + Math.min(1, nightFrac) * 0.76);
  const moonY = groundY - Math.sin(Math.min(1, nightFrac) * Math.PI) * (groundY * 0.62) - 10;

  // Soil water: three bands — wet (available), depleted, and permanently unavailable.
  const depletionFrac = Math.max(0, Math.min(1, inp.depletionMm / Math.max(1, inp.tawMm)));
  const rawFrac = Math.max(0, Math.min(1, inp.rawMm / Math.max(1, inp.tawMm)));
  const rootFrac = Math.max(0.18, Math.min(1, (inp.maturity * 1.5)));
  const rootPx = soilH * 0.82 * rootFrac;

  const colours = leafColour(inp.ks, nitrogen, inp.disease);
  const wilt = inp.ks < 0.85 ? (0.85 - inp.ks) * 46 : 0;      // degrees of droop
  // Height fills the available sky as the canopy closes: a seedling is a sprig,
  // a flowering crop stands tall. Never taller than the frame allows.
  const availH = groundY - H * 0.14;
  const plantH = availH * Math.max(0.18, Math.min(0.98, 0.30 + inp.cc * 0.52 + inp.maturity * 0.20));
  const nPlants = 7;

  const rainDrops = inp.rainMm > 0.5 ? Math.min(70, Math.round(inp.rainMm * 3)) : 0;
  const cloudCover = Math.min(1, inp.rhPct / 100 + inp.rainMm / 30);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Digital twin of your ${spec.name} field: ${inp.stage}, canopy ${(inp.cc * 100).toFixed(0)} percent, water stress ${inp.ks.toFixed(2)}`}>
      <Svg width="100%" height={H}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.top} />
            <Stop offset="1" stopColor={sky.bottom} />
          </LinearGradient>
          <LinearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#6E4F35" />
            <Stop offset="1" stopColor="#40301F" />
          </LinearGradient>
          <LinearGradient id="wetBand" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2F6FA8" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#1D4D78" stopOpacity="0.75" />
          </LinearGradient>
          <LinearGradient id="sunGlow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFE9A8" stopOpacity="0.9" />
            <Stop offset="1" stopColor="#FFD166" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* ---------------------------------------------------------- sky */}
        <Rect x={0} y={0} width={w} height={groundY} fill="url(#sky)" />

        {/* stars at night */}
        {!isDay
          ? jitter.slice(0, 26).map((j, i) => (
              <Circle key={`st${i}`} cx={j * w} cy={jitter[(i + 9) % 64] * groundY * 0.7} r={j > 0.8 ? 1.4 : 0.9} fill="#FFFFFF" opacity={0.35 + j * 0.45} />
            ))
          : null}

        {/* sun or moon */}
        {isDay ? (
          <G>
            <Circle cx={bodyX} cy={bodyY} r={34} fill="url(#sunGlow)" />
            <Circle cx={bodyX} cy={bodyY} r={15} fill={inp.tMaxC > 36 ? '#FFB03A' : '#FFD75E'} />
          </G>
        ) : (
          <G>
            <Circle cx={moonX} cy={moonY} r={11} fill="#EAF0FA" opacity={0.92} />
            <Circle cx={moonX + 4} cy={moonY - 3} r={9} fill={sky.top} opacity={0.85} />
          </G>
        )}

        {/* clouds sized by humidity + rain */}
        {cloudCover > 0.35
          ? [0.18, 0.52, 0.8].map((fx, i) => {
              const cy = groundY * (0.16 + i * 0.07);
              const s = 20 + cloudCover * 26 + jitter[i] * 8;
              const op = Math.min(0.95, 0.35 + cloudCover * 0.6);
              const grey = inp.rainMm > 8 ? '#8892A0' : '#FFFFFF';
              return (
                <G key={`cl${i}`} opacity={op}>
                  <Ellipse cx={w * fx - s * 0.55} cy={cy} rx={s * 0.6} ry={s * 0.42} fill={grey} />
                  <Ellipse cx={w * fx} cy={cy - s * 0.2} rx={s * 0.78} ry={s * 0.55} fill={grey} />
                  <Ellipse cx={w * fx + s * 0.6} cy={cy} rx={s * 0.55} ry={s * 0.4} fill={grey} />
                  <Rect x={w * fx - s * 1.15} y={cy - 2} width={s * 2.3} height={s * 0.44} rx={s * 0.22} fill={grey} />
                </G>
              );
            })
          : null}

        {/* rain, angled by wind */}
        {Array.from({ length: rainDrops }).map((_, i) => {
          const x = jitter[i % 64] * w;
          const y = ((jitter[(i * 3) % 64] * groundY) + i * 7) % groundY;
          const lean = inp.windMs * 1.6;
          return <Line key={`rn${i}`} x1={x} y1={y} x2={x - lean} y2={y + 13} stroke="#BFDCF5" strokeWidth={1.4} opacity={0.55} />;
        })}

        {/* heat shimmer marker when the day is dangerously hot */}
        {inp.tMaxC > 38 ? (
          <G opacity={0.5}>
            {[0.3, 0.5, 0.7].map((fx, i) => (
              <Path key={`ht${i}`} d={`M${w * fx - 16},${groundY - 14 - i * 7} q8,-5 16,0 q8,5 16,0`} stroke="#FFC07A" strokeWidth={1.6} fill="none" />
            ))}
          </G>
        ) : null}

        {/* ------------------------------------------------------- horizon */}
        <Rect x={0} y={groundY - 10} width={w} height={12} fill="#5E7B4B" opacity={0.5} />

        {/* ------------------------------------------------------- plants */}
        {Array.from({ length: nPlants }).map((_, i) => {
          const gap = w / (nPlants + 1);
          const x = gap * (i + 1);
          const vary = 0.82 + jitter[i] * 0.34;
          const h = plantH * vary;
          const lean = (jitter[i + 12] - 0.5) * 6 + wilt * (jitter[i + 20] > 0.5 ? 1 : -1) * 0.4;
          return (
            <Plant
              key={`pl${i}`}
              x={x}
              baseY={groundY}
              h={h}
              crop={inp.crop}
              colours={colours}
              wilt={wilt}
              lean={lean}
              maturity={inp.maturity}
              cc={inp.cc}
              disease={inp.disease}
              rnd={jitter}
              idx={i}
            />
          );
        })}

        {/* ---------------------------------------------------- soil block */}
        {showSoil ? (
          <G>
            <Rect x={0} y={groundY} width={w} height={soilH} fill="url(#soilGrad)" />

            {/* available water band (wet, from the bottom up) */}
            <Rect
              x={0}
              y={groundY + soilH * depletionFrac * 0.86}
              width={w}
              height={soilH * (1 - depletionFrac * 0.86)}
              fill="url(#wetBand)"
            />

            {/* readily-available-water threshold line — the "act now" line */}
            <Line
              x1={0}
              y1={groundY + soilH * rawFrac * 0.86}
              x2={w}
              y2={groundY + soilH * rawFrac * 0.86}
              stroke="#FFC857"
              strokeWidth={1.6}
              strokeDasharray="6 4"
            />
            {/* Labels are placed on opposite sides and pushed apart when the two
                lines are close, so they can never overlap. */}
            {(() => {
              const yRaw = groundY + soilH * rawFrac * 0.86;
              const yWet = groundY + soilH * depletionFrac * 0.86;
              const close = Math.abs(yRaw - yWet) < 22;
              return (
                <G>
                  <SvgText x={6} y={close ? Math.min(yRaw, yWet) - 6 : yRaw - 5} fontSize={9} fill="#FFD98A" fontWeight="600">
                    refill at {Math.round(inp.rawMm)} mm
                  </SvgText>
                  <SvgText x={w - 6} y={close ? Math.max(yRaw, yWet) + 13 : yWet + 12} fontSize={9} fill="#CFE6FA" fontWeight="600" textAnchor="end">
                    {Math.round(inp.depletionMm)} mm used · water below
                  </SvgText>
                </G>
              );
            })()}

            {/* soil texture speckle */}
            {jitter.slice(0, 40).map((j, i) => (
              <Circle key={`sp${i}`} cx={j * w} cy={groundY + 6 + jitter[(i + 5) % 64] * (soilH - 10)} r={0.9 + j} fill="#2B1F13" opacity={0.35} />
            ))}

            {/* roots reaching down as the crop develops */}
            {Array.from({ length: nPlants }).map((_, i) => {
              const gap = w / (nPlants + 1);
              const x = gap * (i + 1);
              const d = rootPx * (0.75 + jitter[i + 30] * 0.5);
              return (
                <G key={`rt${i}`} opacity={0.85}>
                  <Path d={`M${x},${groundY} C${x - 4},${groundY + d * 0.4} ${x + 5},${groundY + d * 0.7} ${x},${groundY + d}`} stroke="#D6C39C" strokeWidth={1.6} fill="none" />
                  <Path d={`M${x},${groundY + d * 0.35} l-11,${d * 0.3}`} stroke="#C9B78F" strokeWidth={1.1} fill="none" />
                  <Path d={`M${x},${groundY + d * 0.55} l12,${d * 0.26}`} stroke="#C9B78F" strokeWidth={1.1} fill="none" />
                </G>
              );
            })}

            {/* depth ruler */}
            <SvgText x={w - 6} y={groundY + 12} fontSize={8.5} fill="#E7D9BE" textAnchor="end">0 cm</SvgText>
            <SvgText x={w - 6} y={groundY + soilH - 5} fontSize={8.5} fill="#E7D9BE" textAnchor="end">
              {Math.round(inp.rootDepthM * 100)} cm
            </SvgText>
          </G>
        ) : (
          <Rect x={0} y={groundY} width={w} height={soilH} fill="#6E4F35" />
        )}
      </Svg>

      {/* legend strip — plain words, always visible */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 8 }}>
        {[
          { c: colours.main, t: inp.ks > 0.9 ? 'Leaves healthy' : inp.ks > 0.7 ? 'Slight thirst' : 'Wilting — needs water' },
          { c: '#4C9BD6', t: `Water left: ${Math.max(0, Math.round(inp.tawMm - inp.depletionMm))} mm` },
          { c: '#FFC857', t: `Refill at ${Math.round(inp.rawMm)} mm used` },
          { c: inp.disease > 0.3 ? '#E06B62' : '#9BB6A5', t: inp.disease > 0.3 ? `Disease on leaves ${(inp.disease * 100).toFixed(0)}%` : 'No disease seen' },
        ].map((l) => (
          <View key={l.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: l.c }} />
            <SvgLabel text={l.t} colour={p.textDim} />
          </View>
        ))}
      </View>
    </View>
  );
}

function SvgLabel({ text, colour }: { text: string; colour: string }) {
  const { p } = useTheme();
  return (
    <View>
      <Svg width={text.length * 5.6} height={13}>
        <SvgText x={0} y={10} fontSize={10.5} fill={colour || p.textDim} fontWeight="600">{text}</SvgText>
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ plant -- */
function Plant({
  x, baseY, h, crop, colours, wilt, lean, maturity, cc, disease, rnd, idx,
}: {
  x: number; baseY: number; h: number; crop: CropKey;
  colours: { main: string; dark: string; light: string };
  wilt: number; lean: number; maturity: number; cc: number; disease: number; rnd: number[]; idx: number;
}) {
  const stemTop = baseY - h;
  const stemW = Math.max(1.8, h * 0.035);
  const leafLen = h * (0.26 + cc * 0.2);
  const pairs = Math.max(2, Math.round(3 + cc * 4));
  const droop = wilt;

  const lesions = (cx: number, cy: number, r: number, key: string) =>
    disease > 0.18
      ? Array.from({ length: Math.round(disease * 4) }).map((_, k) => (
          <Circle
            key={`${key}-${k}`}
            cx={cx + (rnd[(idx + k) % 64] - 0.5) * r * 1.4}
            cy={cy + (rnd[(idx + k + 7) % 64] - 0.5) * r}
            r={Math.max(1.1, r * 0.16)}
            fill="#6B3B1E"
            opacity={0.85}
          />
        ))
      : null;

  /** Narrow blade for cereals — long, tapering, drooping under stress. */
  const blade = (side: 1 | -1, atY: number, len: number, key: string, tint = colours.main) => {
    const dx = side * len;
    const dip = droop * 0.55 + len * 0.14;
    return (
      <G key={key}>
        <Path
          d={`M${x},${atY} C${x + dx * 0.35},${atY - len * 0.24} ${x + dx * 0.72},${atY + dip * 0.2} ${x + dx},${atY + dip}
              C${x + dx * 0.7},${atY + dip + len * 0.16} ${x + dx * 0.32},${atY + len * 0.14} ${x},${atY}`}
          fill={tint}
          stroke={colours.dark}
          strokeWidth={0.5}
        />
        <Line x1={x} y1={atY} x2={x + dx * 0.94} y2={atY + dip * 0.92} stroke={colours.light} strokeWidth={0.7} opacity={0.7} />
        {lesions(x + dx * 0.55, atY + dip * 0.5, len * 0.5, key)}
      </G>
    );
  };

  /** Broad rounded leaf on a short petiole — what a tomato or potato really looks like. */
  const broadLeaf = (side: 1 | -1, atY: number, len: number, key: string, tint = colours.main) => {
    const dx = side * len;
    const dip = droop * 0.7 + len * 0.1;
    const px0 = x + dx * 0.26;                    // petiole end / leaf base
    const py0 = atY + dip * 0.3;
    const tipX = x + dx;
    const tipY = atY + dip;
    const spread = len * 0.46;                    // half-width of the blade
    return (
      <G key={key}>
        {/* petiole */}
        <Line x1={x} y1={atY} x2={px0} y2={py0} stroke={colours.dark} strokeWidth={Math.max(1, len * 0.05)} strokeLinecap="round" />
        {/* blade: a rounded ovate leaf with a soft point */}
        <Path
          d={`M${px0},${py0}
              C${px0 + dx * 0.18},${py0 - spread} ${tipX - dx * 0.22},${tipY - spread * 0.9} ${tipX},${tipY}
              C${tipX - dx * 0.22},${tipY + spread * 0.9} ${px0 + dx * 0.18},${py0 + spread} ${px0},${py0} Z`}
          fill={tint}
          stroke={colours.dark}
          strokeWidth={0.6}
        />
        {/* midrib + two side veins */}
        <Line x1={px0} y1={py0} x2={tipX} y2={tipY} stroke={colours.light} strokeWidth={0.8} opacity={0.75} />
        <Line x1={px0 + dx * 0.3} y1={py0 + (tipY - py0) * 0.3} x2={px0 + dx * 0.5} y2={py0 - spread * 0.4} stroke={colours.light} strokeWidth={0.5} opacity={0.5} />
        <Line x1={px0 + dx * 0.3} y1={py0 + (tipY - py0) * 0.3} x2={px0 + dx * 0.5} y2={py0 + spread * 0.5} stroke={colours.light} strokeWidth={0.5} opacity={0.5} />
        {lesions(px0 + dx * 0.5, py0 + (tipY - py0) * 0.45, spread, key)}
      </G>
    );
  };

  const leaf = blade;

  // Cereals: a tuft of blades plus an ear once grain fill begins.
  if (crop === 'wheat' || crop === 'rice' || crop === 'maize') {
    const ear = maturity > 0.5;
    const earH = h * 0.2;
    return (
      <G transform={`rotate(${lean} ${x} ${baseY})`}>
        <Line x1={x} y1={baseY} x2={x} y2={stemTop} stroke={colours.dark} strokeWidth={stemW} strokeLinecap="round" />
        {Array.from({ length: pairs }).map((_, i) => {
          const atY = baseY - (h * 0.22) - (i * (h * 0.62)) / pairs;
          const len = leafLen * (1 - i * 0.08);
          return (
            <G key={`cl${i}`}>
              {leaf(1, atY, len, `L${i}`)}
              {leaf(-1, atY, len * 0.94, `R${i}`)}
            </G>
          );
        })}
        {ear ? (
          crop === 'maize' ? (
            <G>
              <Rect x={x - h * 0.045} y={stemTop + h * 0.02} width={h * 0.09} height={earH} rx={h * 0.045}
                fill={maturity > 0.8 ? '#E8C24A' : '#C9D96A'} />
              {Array.from({ length: 4 }).map((_, r) => (
                <Line key={`kr${r}`} x1={x - h * 0.04} y1={stemTop + h * 0.05 + r * earH * 0.22} x2={x + h * 0.04} y2={stemTop + h * 0.05 + r * earH * 0.22} stroke="#A88B2E" strokeWidth={0.6} />
              ))}
            </G>
          ) : (
            <G>
              {Array.from({ length: 7 }).map((_, r) => {
                const yy = stemTop + r * (earH / 7);
                const sway = maturity > 0.85 ? 2.2 : 0;
                return (
                  <G key={`gr${r}`}>
                    <Ellipse cx={x - 2.4 + sway} cy={yy} rx={2.1} ry={2.9} fill={maturity > 0.85 ? '#D9B24C' : '#B8C86A'} />
                    <Ellipse cx={x + 2.4 + sway} cy={yy} rx={2.1} ry={2.9} fill={maturity > 0.85 ? '#D9B24C' : '#B8C86A'} />
                  </G>
                );
              })}
              {maturity > 0.85
                ? Array.from({ length: 5 }).map((_, r) => (
                    <Line key={`aw${r}`} x1={x} y1={stemTop} x2={x + (r - 2) * 3} y2={stemTop - h * 0.11} stroke="#C6A24C" strokeWidth={0.6} />
                  ))
                : null}
            </G>
          )
        ) : null}
      </G>
    );
  }

  // Vine / bunch crops
  if (crop === 'grape') {
    return (
      <G transform={`rotate(${lean} ${x} ${baseY})`}>
        <Line x1={x} y1={baseY} x2={x} y2={stemTop} stroke="#6B4A2E" strokeWidth={stemW * 1.5} strokeLinecap="round" />
        <Line x1={x - h * 0.3} y1={stemTop + h * 0.08} x2={x + h * 0.3} y2={stemTop + h * 0.08} stroke="#8A6640" strokeWidth={1.6} />
        {Array.from({ length: pairs }).map((_, i) => {
          const atY = stemTop + h * 0.1 + i * (h * 0.16);
          return <G key={`gv${i}`}>{leaf(i % 2 ? 1 : -1, atY, leafLen * 0.8, `GL${i}`)}</G>;
        })}
        {maturity > 0.55 ? (
          <G>
            {Array.from({ length: 4 }).map((_, r) =>
              Array.from({ length: 4 - r }).map((__, c) => (
                <Circle
                  key={`gp${r}-${c}`}
                  cx={x + (c - (3 - r) / 2) * 4.4}
                  cy={stemTop + h * 0.24 + r * 4}
                  r={2.3}
                  fill={maturity > 0.8 ? '#7E5AA8' : '#9FBF63'}
                />
              )),
            )}
          </G>
        ) : null}
      </G>
    );
  }

  // Broadleaf crops with visible fruit (tomato, chilli, potato, onion, cotton, banana)
  const fruitColour: Partial<Record<CropKey, string>> = {
    tomato: maturity > 0.78 ? '#E24B3C' : '#93B84F',
    chilli: maturity > 0.75 ? '#D6382C' : '#7FA84A',
    banana: maturity > 0.8 ? '#EBC94A' : '#A8BE55',
    cotton: '#F5F3EE',
    potato: '#C8A06A',
    onion: '#D9A15E',
  };
  const showFruit = maturity > 0.5 && fruitColour[crop];

  return (
    <G transform={`rotate(${lean} ${x} ${baseY})`}>
      <Line x1={x} y1={baseY} x2={x} y2={stemTop} stroke={colours.dark} strokeWidth={stemW} strokeLinecap="round" />
      {Array.from({ length: Math.max(2, Math.round(pairs * 0.7)) }).map((_, i) => {
        const n = Math.max(2, Math.round(pairs * 0.7));
        const atY = baseY - h * 0.18 - (i * (h * 0.78)) / Math.max(1, n - 1);
        const len = leafLen * (1.2 - i * 0.12);
        return (
          <G key={`bl${i}`}>
            {broadLeaf(i % 2 === 0 ? 1 : -1, atY, len, `BL${i}`)}
            {broadLeaf(i % 2 === 0 ? -1 : 1, atY - h * 0.045, len * 0.86, `BR${i}`, colours.light)}
          </G>
        );
      })}

      {/* onion and potato keep their harvest underground */}
      {crop === 'onion' || crop === 'potato' ? (
        <G>
          <Ellipse cx={x} cy={baseY + 8} rx={h * 0.12} ry={h * 0.09} fill={fruitColour[crop]} opacity={0.95} />
          <Ellipse cx={x} cy={baseY + 8} rx={h * 0.08} ry={h * 0.06} fill="#E8C08A" opacity={0.6} />
        </G>
      ) : null}

      {showFruit && crop !== 'onion' && crop !== 'potato'
        ? Array.from({ length: crop === 'banana' ? 5 : 3 }).map((_, k) => {
            const fy = baseY - h * (0.34 + k * 0.14);
            const fx = x + (k % 2 ? 1 : -1) * h * 0.12;
            const r = h * (crop === 'chilli' ? 0.035 : 0.055);
            if (crop === 'chilli') {
              return <Path key={`fr${k}`} d={`M${fx},${fy} q${r * 1.2},${r * 2} ${-r * 0.4},${r * 4}`} stroke={fruitColour[crop]} strokeWidth={r * 1.5} fill="none" strokeLinecap="round" />;
            }
            if (crop === 'banana') {
              return <Path key={`fr${k}`} d={`M${fx - r},${fy} q${r},${r * 1.6} ${r * 2},0`} stroke={fruitColour[crop]} strokeWidth={r * 1.1} fill="none" strokeLinecap="round" />;
            }
            return (
              <G key={`fr${k}`}>
                <Circle cx={fx} cy={fy} r={r} fill={fruitColour[crop]} />
                <Circle cx={fx - r * 0.3} cy={fy - r * 0.35} r={r * 0.3} fill="#FFFFFF" opacity={0.4} />
              </G>
            );
          })
        : null}
    </G>
  );
}
