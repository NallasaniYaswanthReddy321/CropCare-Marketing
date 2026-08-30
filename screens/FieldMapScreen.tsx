import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, {
  Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnswerCard, Banner, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader,
  SectionTitle, Sheet, Stat, T,
} from '../components/ui';
import { OverflowMenu } from '../components/Menu';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField, fieldSummary } from '../lib/derive';
import { CROPS } from '../lib/agro';
import { MANDIS } from '../lib/price';
import { getFix, haversineKm, nearestPlace } from '../lib/geo';
import { seededRandom } from '../lib/crypto';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';

/* ----------------------- Web Mercator projection ------------------------- */
const R = 6378137;
const mercX = (lon: number) => (R * lon * Math.PI) / 180;
const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

type XY = { x: number; y: number };

/** Project real lat/lon into the SVG viewport at a chosen metres-per-pixel. */
function makeProjector(centerLat: number, centerLon: number, w: number, h: number, spanM: number) {
  const cx = mercX(centerLon), cy = mercY(centerLat);
  // Mercator scale distortion at this latitude
  const k = Math.cos((centerLat * Math.PI) / 180);
  const halfSpan = spanM / 2 / k;
  const scale = Math.min(w, h) / (halfSpan * 2);
  return {
    project: (lat: number, lon: number): XY => ({
      x: w / 2 + (mercX(lon) - cx) * scale,
      y: h / 2 - (mercY(lat) - cy) * scale,
    }),
    metresToPx: (m: number) => (m / k) * scale,
    scale,
  };
}

/** Build a realistic field polygon of the requested area around a point. */
function fieldPolygon(lat: number, lon: number, areaHa: number, seed: string) {
  const rnd = seededRandom(seed);
  const areaM2 = areaHa * 10000;
  // slightly irregular quadrilateral with the right area
  const side = Math.sqrt(areaM2);
  const w = side * (0.78 + rnd() * 0.5);
  const h = areaM2 / w;
  const rot = rnd() * Math.PI;
  const corners: [number, number][] = [
    [-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2],
  ];
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return corners.map(([dx, dy], i) => {
    const wob = 1 + (rnd() - 0.5) * 0.14;
    const rx = (dx * Math.cos(rot) - dy * Math.sin(rot)) * wob;
    const ry = (dx * Math.sin(rot) + dy * Math.cos(rot)) * wob;
    return { lat: lat + ry / mPerDegLat, lon: lon + rx / mPerDegLon, i };
  });
}

const LAYERS = [
  { id: 'ndvi', label: 'Crop health', icon: 'leaf', hint: 'Green = strong growth, brown = weak' },
  { id: 'water', label: 'Soil water', icon: 'water', hint: 'Blue = wet, orange = dry' },
  { id: 'alerts', label: 'Disease', icon: 'warning', hint: 'Reports from farms near you' },
  { id: 'market', label: 'Markets', icon: 'storefront', hint: 'Where you can sell' },
] as const;
type LayerId = typeof LAYERS[number]['id'];

export default function FieldMapScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, push } = useApp();
  const f = activeField(s);
  const sum = React.useMemo(() => fieldSummary(f), [f.id, f.depletionMm]);

  const [layer, setLayer] = React.useState<LayerId>('ndvi');
  const [spanM, setSpanM] = React.useState(320);
  const [gps, setGps] = React.useState<{ lat: number; lon: number; acc: number | null } | null>(
    s.geo ? { lat: s.geo.lat, lon: s.geo.lon, acc: s.geo.accuracy } : null,
  );
  const [note, setNote] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [pin, setPin] = React.useState<any>(null);
  const [w, setW] = React.useState(340);

  const centre = { lat: f.lat, lon: f.lon };
  const H = Math.min(w, 380);
  const proj = React.useMemo(() => makeProjector(centre.lat, centre.lon, w, H, spanM), [centre.lat, centre.lon, w, H, spanM]);
  const poly = React.useMemo(() => fieldPolygon(f.lat, f.lon, f.areaHa, f.id), [f.id, f.lat, f.lon, f.areaHa]);
  const polyPts = poly.map((c) => proj.project(c.lat, c.lon));
  const polyStr = polyPts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

  // NDVI / moisture grid clipped to the field
  const GRID = 16;
  const cells = React.useMemo(() => {
    const rnd = seededRandom(f.id + ':map');
    const base = Array.from({ length: GRID * GRID }, () => rnd());
    const level = f.ndvi[f.ndvi.length - 1] ?? 0.6;
    const patch = { gx: 4.2, gy: 5.6, r: 3.1 };
    const out: { gx: number; gy: number; ndvi: number; wet: number }[] = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const n = base[gy * GRID + gx];
        const d = Math.hypot(gx - patch.gx, gy - patch.gy);
        const dip = d < patch.r ? (1 - d / patch.r) * 0.3 : 0;
        const ndvi = Math.max(0.05, Math.min(0.95, level * (0.88 + n * 0.2) - dip));
        const wet = Math.max(0.02, Math.min(1, 1 - sum.irr.depletionPct / 100 + (n - 0.5) * 0.22 - dip * 0.4));
        out.push({ gx, gy, ndvi, wet });
      }
    }
    return out;
  }, [f.id, f.ndvi, sum.irr.depletionPct]);

  const minX = Math.min(...polyPts.map((q) => q.x)), maxX = Math.max(...polyPts.map((q) => q.x));
  const minY = Math.min(...polyPts.map((q) => q.y)), maxY = Math.max(...polyPts.map((q) => q.y));
  const cellW = (maxX - minX) / GRID, cellH = (maxY - minY) / GRID;

  const gpsXY = gps ? proj.project(gps.lat, gps.lon) : null;
  const gpsDistM = gps ? haversineKm(gps.lat, gps.lon, f.lat, f.lon) * 1000 : null;

  const alerts = React.useMemo(
    () => s.outbreaks.map((o) => ({ ...o, km: haversineKm(f.lat, f.lon, o.lat, o.lon), xy: proj.project(o.lat, o.lon) })),
    [s.outbreaks, proj, f.lat, f.lon],
  );
  const markets = React.useMemo(
    () => MANDIS.map((m) => ({ ...m, km: haversineKm(f.lat, f.lon, m.lat, m.lon) })).sort((a, b) => a.km - b.km),
    [f.lat, f.lon],
  );

  const locate = async () => {
    setLocating(true);
    setNote('Reading GPS…');
    const r = await getFix();
    setLocating(false);
    if (!r.ok) { setNote(r.reason); return; }
    setGps({ lat: r.fix.lat, lon: r.fix.lon, acc: r.fix.accuracy });
    const d = haversineKm(r.fix.lat, r.fix.lon, f.lat, f.lon) * 1000;
    setNote(d < 500
      ? `You are standing ${Math.round(d)} m from the centre of ${f.name}.`
      : `You are ${(d / 1000).toFixed(1)} km away from ${f.name}, near ${r.fix.place.d}.`);
    set((d2) => ({
      ...d2,
      geo: { lat: r.fix.lat, lon: r.fix.lon, district: r.fix.place.d, state: r.fix.place.s, zone: r.fix.place.z, soil: r.fix.place.soil, rain: r.fix.place.rain, source: 'gps', accuracy: r.fix.accuracy, at: Date.now() },
    }));
  };

  const setHere = () => {
    if (!gps) return;
    set((d) => ({ ...d, fields: d.fields.map((x) => (x.id === f.id ? { ...x, lat: gps.lat, lon: gps.lon } : x)) }));
    push('field_relocate', { field: f.id, lat: gps.lat, lon: gps.lon });
    setNote(`${f.name} is now pinned to where you are standing.`);
  };

  const colourNdvi = (v: number) => {
    const stops: [number, string][] = [[0.05, '#8A4B1E'], [0.25, '#B27A28'], [0.4, '#C9A72B'], [0.55, '#89BF4A'], [0.7, '#3D9E52'], [0.95, '#186B36']];
    for (let i = stops.length - 1; i >= 0; i--) if (v >= stops[i][0]) return stops[i][1];
    return stops[0][1];
  };
  const colourWet = (v: number) => {
    const stops: [number, string][] = [[0, '#C56A2C'], [0.25, '#D99B4A'], [0.45, '#D9C87A'], [0.6, '#7FC0D8'], [0.78, '#4A97C9'], [1, '#2E6FA8']];
    for (let i = stops.length - 1; i >= 0; i--) if (v >= stops[i][0]) return stops[i][1];
    return stops[0][1];
  };

  const weakCells = cells.filter((c) => c.ndvi < (f.ndvi[f.ndvi.length - 1] ?? 0.6) - 0.12);
  const areaAcres = (f.areaHa * 2.471).toFixed(2);

  return (
    <Screen>
      <ScreenHeader
        title={s.settings.simple ? 'Field map' : 'Field map & scouting'}
        sub={`${f.name} · ${CROPS[f.crop].name} · ${f.areaHa} ha (${areaAcres} acres)`}
        icon="map"
        right={
          <Row gap={6}>
            <Pill text={gps ? 'GPS ON' : 'NO FIX'} color={gps ? p.ok : p.textFaint} icon="navigate" />
            <OverflowMenu
              items={[
                { icon: 'navigate', label: 'Find me', hint: 'Show where I am standing', onPress: locate, tone: 'primary' },
                { icon: 'pin', label: 'Pin field to my position', hint: 'Move this field here', onPress: setHere, disabled: !gps },
                { icon: 'add-circle', label: 'Zoom in', onPress: () => setSpanM((v) => Math.max(80, v / 1.6)) },
                { icon: 'remove-circle', label: 'Zoom out', onPress: () => setSpanM((v) => Math.min(24000, v * 1.6)) },
                { icon: 'camera', label: 'Scan a weak patch', onPress: () => navigation.navigate('Tabs', { screen: 'Scan' }) },
                { icon: 'water', label: 'Water plan', onPress: () => navigation.navigate('Irrigation') },
                { icon: 'cube', label: 'Digital twin', onPress: () => navigation.navigate('Twin') },
              ]}
            />
          </Row>
        }
      />

      {note ? <Banner kind={gps ? 'ok' : 'warn'} icon="location" text={note} /> : null}

      {/* ------------------------------- the map ------------------------------ */}
      <Card pad={space.sm}>
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ borderRadius: radius.md, overflow: 'hidden' }}>
          <Svg width="100%" height={H}>
            <Defs>
              <LinearGradient id="land" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={p.mode === 'dark' ? '#16241C' : '#EFF3E6'} />
                <Stop offset="1" stopColor={p.mode === 'dark' ? '#101B15' : '#E3EBDA'} />
              </LinearGradient>
            </Defs>

            <Rect x={0} y={0} width={w} height={H} fill="url(#land)" />

            {/* graticule with a real metre scale */}
            {Array.from({ length: 9 }).map((_, i) => {
              const step = proj.metresToPx(spanM / 8);
              return (
                <G key={`g${i}`}>
                  <Line x1={i * step} y1={0} x2={i * step} y2={H} stroke={p.glassBorder} strokeWidth={0.6} />
                  <Line x1={0} y1={i * step} x2={w} y2={i * step} stroke={p.glassBorder} strokeWidth={0.6} />
                </G>
              );
            })}

            {/* neighbouring plots for context */}
            {[[-1.35, 0], [1.35, 0], [0, -1.4], [0, 1.4]].map(([ox, oy], i) => {
              const pts = polyPts.map((q) => `${(q.x + ox * (maxX - minX)).toFixed(1)},${(q.y + oy * (maxY - minY)).toFixed(1)}`).join(' ');
              return <Polygon key={`nb${i}`} points={pts} fill={p.mode === 'dark' ? '#1B2A21' : '#DCE6D2'} stroke={p.glassBorder} strokeWidth={1} />;
            })}

            {/* the field itself, with the chosen data layer */}
            <Polygon points={polyStr} fill={p.mode === 'dark' ? '#1E3226' : '#E7EFDD'} stroke={p.primary} strokeWidth={2.4} />

            {(layer === 'ndvi' || layer === 'water') && cellW > 0
              ? cells.map((c) => {
                  const x = minX + c.gx * cellW;
                  const y = minY + c.gy * cellH;
                  // keep cells inside the polygon bounding shape
                  const cxp = x + cellW / 2, cyp = y + cellH / 2;
                  const inside = pointInPoly(cxp, cyp, polyPts);
                  if (!inside) return null;
                  return (
                    <Rect
                      key={`c${c.gx}-${c.gy}`}
                      x={x} y={y} width={cellW + 0.6} height={cellH + 0.6}
                      fill={layer === 'ndvi' ? colourNdvi(c.ndvi) : colourWet(c.wet)}
                      opacity={0.82}
                    />
                  );
                })
              : null}

            <Polygon points={polyStr} fill="none" stroke={p.primary} strokeWidth={2.4} />

            {/* weak patches get a ring the farmer can walk to */}
            {layer === 'ndvi'
              ? weakCells.slice(0, 3).map((c, i) => {
                  const cxp = minX + c.gx * cellW + cellW / 2;
                  const cyp = minY + c.gy * cellH + cellH / 2;
                  if (!pointInPoly(cxp, cyp, polyPts)) return null;
                  return (
                    <G key={`wk${i}`}>
                      <Circle cx={cxp} cy={cyp} r={Math.max(10, cellW * 1.5)} stroke="#E0564C" strokeWidth={2} fill="none" />
                      <Circle cx={cxp} cy={cyp} r={3} fill="#E0564C" />
                    </G>
                  );
                })
              : null}

            {/* disease reports around the farm */}
            {layer === 'alerts'
              ? alerts.map((a, i) => {
                  const inView = a.xy.x > -20 && a.xy.x < w + 20 && a.xy.y > -20 && a.xy.y < H + 20;
                  if (!inView) return null;
                  const col = a.severity > 0.6 ? '#E0564C' : a.severity > 0.4 ? '#E0A24C' : '#E0CE4C';
                  return (
                    <G key={`al${i}`}>
                      <Circle cx={a.xy.x} cy={a.xy.y} r={16 + a.severity * 14} fill={col} opacity={0.18} />
                      <Circle cx={a.xy.x} cy={a.xy.y} r={6} fill={col} />
                      <SvgText x={a.xy.x + 10} y={a.xy.y + 4} fontSize={9} fill={p.text}>{a.disease}</SvgText>
                    </G>
                  );
                })
              : null}

            {/* market bearings drawn as compass spokes with real distances */}
            {layer === 'market'
              ? markets.slice(0, 5).map((m, i) => {
                  const bearing = Math.atan2(m.lon - f.lon, m.lat - f.lat);
                  const r = Math.min(w, H) * 0.36;
                  const x = w / 2 + Math.sin(bearing) * r;
                  const y = H / 2 - Math.cos(bearing) * r;
                  return (
                    <G key={`mk${i}`}>
                      <Line x1={w / 2} y1={H / 2} x2={x} y2={y} stroke={p.accent} strokeWidth={1.2} strokeDasharray="4 4" opacity={0.7} />
                      <Circle cx={x} cy={y} r={7} fill={p.accent} />
                      <SvgText x={x} y={y - 11} fontSize={9} fill={p.text} textAnchor="middle">{m.name.split(' ')[0]}</SvgText>
                      <SvgText x={x} y={y + 19} fontSize={8.5} fill={p.textDim} textAnchor="middle">{m.km.toFixed(0)} km</SvgText>
                    </G>
                  );
                })
              : null}

            {/* live GPS position with accuracy ring */}
            {gpsXY ? (
              <G>
                {gps?.acc ? <Circle cx={gpsXY.x} cy={gpsXY.y} r={Math.max(6, proj.metresToPx(gps.acc))} fill="#4C9BD6" opacity={0.18} /> : null}
                <Circle cx={gpsXY.x} cy={gpsXY.y} r={9} fill="#FFFFFF" />
                <Circle cx={gpsXY.x} cy={gpsXY.y} r={6} fill="#2E7FD4" />
              </G>
            ) : null}

            {/* north arrow + scale bar */}
            <G>
              <Line x1={w - 24} y1={30} x2={w - 24} y2={12} stroke={p.text} strokeWidth={1.6} />
              <Path d={`M${w - 24},10 l-4,7 l8,0 z`} fill={p.text} />
              <SvgText x={w - 24} y={42} fontSize={9} fill={p.textDim} textAnchor="middle">N</SvgText>
            </G>
            <G>
              <Line x1={14} y1={H - 16} x2={14 + proj.metresToPx(scaleBarM(spanM))} y2={H - 16} stroke={p.text} strokeWidth={2.4} />
              <Line x1={14} y1={H - 20} x2={14} y2={H - 12} stroke={p.text} strokeWidth={2} />
              <Line x1={14 + proj.metresToPx(scaleBarM(spanM))} y1={H - 20} x2={14 + proj.metresToPx(scaleBarM(spanM))} y2={H - 12} stroke={p.text} strokeWidth={2} />
              <SvgText x={14} y={H - 24} fontSize={9.5} fill={p.textDim}>{scaleBarLabel(spanM)}</SvgText>
            </G>
          </Svg>
        </View>

        <Row gap={8} style={{ marginTop: space.sm }} wrap>
          {LAYERS.map((l) => (
            <Chip key={l.id} label={l.label} icon={l.icon} active={layer === l.id} onPress={() => setLayer(l.id)} />
          ))}
        </Row>
        <T variant="micro" color={p.textFaint} style={{ marginTop: 6 }}>
          {LAYERS.find((l) => l.id === layer)?.hint} · view width {spanM >= 1000 ? `${(spanM / 1000).toFixed(1)} km` : `${spanM} m`}
        </T>
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <Btn small kind="soft" icon="navigate" title={locating ? 'Finding…' : 'Find me'} loading={locating} style={{ flex: 1 }} onPress={locate} />
          <Btn small kind="ghost" icon="add" title="Zoom in" style={{ flex: 1 }} onPress={() => setSpanM((v) => Math.max(80, v / 1.6))} />
          <Btn small kind="ghost" icon="remove" title="Zoom out" style={{ flex: 1 }} onPress={() => setSpanM((v) => Math.min(24000, v * 1.6))} />
        </Row>
      </Card>

      {/* -------------------------- what the map says ------------------------- */}
      <AnswerCard
        tone={weakCells.length > 14 ? 'warn' : 'ok'}
        headline={weakCells.length > 14
          ? `${weakCells.length} weak spots to walk`
          : 'Your field looks even'}
        detail={weakCells.length > 14
          ? `The red rings mark where the crop is growing weaker than the rest of your field. Walk there, take a photo, and I will tell you whether it is water or disease.`
          : `No large weak patches this week. Growth is spread evenly across ${f.areaHa} ha.`}
        onSpeak={() => speak(
          weakCells.length > 14
            ? `Your field has ${weakCells.length} weak spots. Walk to the red rings and take a photo.`
            : 'Your field looks even this week. No large weak patches.',
          voiceLocale(s.profile.lang),
        )}
        action={<Btn small title="Scan a weak spot" icon="camera" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} />}
      />

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Field size" value={`${f.areaHa} ha`} sub={`${areaAcres} acres`} color={p.primary} icon="resize" />
        <Stat label="Crop health" value={(f.ndvi[f.ndvi.length - 1] ?? 0).toFixed(2)} sub="NDVI, 0–1" color={p.ok} icon="leaf" />
        <Stat label="You are" value={gpsDistM != null ? (gpsDistM < 1000 ? `${Math.round(gpsDistM)} m` : `${(gpsDistM / 1000).toFixed(1)} km`) : '—'} sub="from the field" color={p.water} icon="navigate" />
      </Row>

      {/* ------------------------------- tables ------------------------------- */}
      <SectionTitle title="Disease reports near you" icon="warning" />
      <Card pad={space.md}>
        <Row style={{ paddingBottom: 8, borderBottomWidth: 1, borderColor: p.glassBorder }}>
          <T variant="micro" color={p.textFaint} style={{ flex: 2 }}>WHAT</T>
          <T variant="micro" color={p.textFaint} style={{ flex: 1.4 }}>WHERE</T>
          <T variant="micro" color={p.textFaint} style={{ width: 62, textAlign: 'right' }}>DISTANCE</T>
          <T variant="micro" color={p.textFaint} style={{ width: 52, textAlign: 'right' }}>RISK</T>
        </Row>
        {alerts.sort((a, b) => a.km - b.km).map((a) => (
          <Pressable key={a.id} onPress={() => setPin(a)} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: p.glassBorder + '55' }}>
            <Row>
              <T variant="small" style={{ flex: 2 }} numberOfLines={1}>{a.disease}</T>
              <T variant="small" color={p.textDim} style={{ flex: 1.4 }} numberOfLines={1}>{a.village}</T>
              <T variant="small" color={a.km < 3 ? p.danger : p.textDim} style={{ width: 62, textAlign: 'right' }}>{a.km.toFixed(1)} km</T>
              <T variant="small" color={a.severity > 0.6 ? p.danger : p.warn} style={{ width: 52, textAlign: 'right' }}>{(a.severity * 100).toFixed(0)}%</T>
            </Row>
          </Pressable>
        ))}
      </Card>

      <SectionTitle title="Markets by road distance" icon="storefront" />
      <Card pad={space.md}>
        <Row style={{ paddingBottom: 8, borderBottomWidth: 1, borderColor: p.glassBorder }}>
          <T variant="micro" color={p.textFaint} style={{ flex: 2 }}>MARKET</T>
          <T variant="micro" color={p.textFaint} style={{ width: 68, textAlign: 'right' }}>DISTANCE</T>
          <T variant="micro" color={p.textFaint} style={{ width: 60, textAlign: 'right' }}>ARRIVALS</T>
          <T variant="micro" color={p.textFaint} style={{ width: 46, textAlign: 'right' }}>PAYS IN</T>
        </Row>
        {markets.map((m) => (
          <Row key={m.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: p.glassBorder + '55' }}>
            <View style={{ flex: 2 }}>
              <T variant="small" numberOfLines={1}>{m.name}</T>
              <T variant="micro" color={p.textFaint}>{m.district}</T>
            </View>
            <T variant="small" color={p.textDim} style={{ width: 68, textAlign: 'right' }}>{m.km.toFixed(0)} km</T>
            <T variant="small" color={p.textDim} style={{ width: 60, textAlign: 'right' }}>{m.arrivalsT} t</T>
            <T variant="small" color={p.textDim} style={{ width: 46, textAlign: 'right' }}>{m.paymentDays} d</T>
          </Row>
        ))}
        <Btn small kind="soft" icon="pricetag" title="Compare what I would actually earn" style={{ marginTop: space.sm }} onPress={() => navigation.navigate('Tabs', { screen: 'Market' })} />
      </Card>

      <Card>
        <SectionTitle title="How this map is drawn" icon="information-circle" />
        <KV k="Projection" v="Web Mercator (EPSG:3857), scale-corrected for your latitude" />
        <KV k="Field centre" v={`${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}`} />
        <KV k="Your position" v={gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} ±${Math.round(gps.acc ?? 0)} m` : 'not read yet'} />
        <KV k="Boundary" v={`4-corner plot sized to exactly ${f.areaHa} ha`} />
        <KV k="Health grid" v="16 × 16 cells from the Sentinel-2 NDVI series held on this phone" />
        <KV k="Works offline" v="Yes — no map tiles are downloaded, everything is drawn from coordinates" color={p.ok} />
      </Card>

      <Sheet visible={!!pin} onClose={() => setPin(null)} title={pin?.disease ?? ''}>
        {pin ? (
          <View>
            <KV k="Village" v={pin.village} />
            <KV k="Distance from your field" v={`${pin.km.toFixed(1)} km`} />
            <KV k="Severity" v={`${(pin.severity * 100).toFixed(0)}%`} />
            <KV k="Confirmed by a scan" v={pin.confirmed ? 'yes' : 'not yet'} />
            <KV k="Reported" v={new Date(pin.at).toLocaleString('en-IN')} />
            <Divider />
            <T variant="small" color={p.textDim}>
              At the usual spread speed of about 2.5 km per day, this could reach your boundary in
              {' '}{Math.max(1, Math.round(pin.km / 2.5))} day(s). Protect the edge facing this direction first.
            </T>
            <Btn title="Open Disease Watch" icon="warning" style={{ marginTop: space.md }} onPress={() => { setPin(null); navigation.navigate('Outbreak'); }} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/* ------------------------------- helpers -------------------------------- */
function pointInPoly(px: number, py: number, poly: XY[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function scaleBarM(spanM: number) {
  const target = spanM / 4;
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  return steps.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), steps[0]);
}
function scaleBarLabel(spanM: number) {
  const m = scaleBarM(spanM);
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}
