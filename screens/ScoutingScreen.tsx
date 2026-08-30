import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Rect, Stop, Text as SvgText, LinearGradient as SvgGrad } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Sparkline, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField } from '../lib/derive';
import { seededRandom } from '../lib/crypto';
import { CROPS } from '../lib/agro';

const GRID = 14;

export default function ScoutingScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, push, audit } = useApp();
  const f = activeField(s);
  const [pass, setPass] = React.useState(9);
  const [playing, setPlaying] = React.useState(true);

  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setPass((v) => (v + 1) % 10), 800);
    return () => clearInterval(t);
  }, [playing]);

  // Spatially-correlated NDVI surface: smooth field gradient + two stress patches.
  const surface = React.useMemo(() => {
    const rnd = seededRandom(f.id + ':ndvi');
    const base = Array.from({ length: GRID * GRID }, () => rnd());
    const patches = [
      { x: 3.5, y: 4.2, r: 2.6, depth: 0.34, cause: 'Water stress — emitter blockage suspected' },
      { x: 10.2, y: 9.4, r: 1.9, depth: 0.27, cause: 'Disease focus — matches late blight signature' },
    ];
    return (t: number) => {
      const level = f.ndvi[t] ?? 0.6;
      const cells: { v: number; x: number; y: number }[] = [];
      for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++) {
          let v = level * (0.86 + base[y * GRID + x] * 0.22) - (y / GRID) * 0.05;
          patches.forEach((pt, i) => {
            const d = Math.hypot(x - pt.x, y - pt.y);
            if (d < pt.r) v -= pt.depth * (1 - d / pt.r) * Math.max(0, (t - 4) / 5) * (i === 1 ? 1 : 0.85);
          });
          cells.push({ v: Math.max(0.05, Math.min(0.95, v)), x, y });
        }
      return { cells, patches };
    };
  }, [f.id, f.ndvi]);

  const { cells, patches } = surface(pass);
  const median = [...cells].sort((a, b) => a.v - b.v)[Math.floor(cells.length / 2)].v;
  const anomalies = cells.filter((c) => c.v < median - 0.12);
  const clusters = patches.map((pt, i) => {
    const near = anomalies.filter((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < pt.r + 0.6);
    const severity = near.length ? (median - near.reduce((a, c) => a + c.v, 0) / near.length) / median : 0;
    return { ...pt, cells: near.length, severity: +severity.toFixed(2), id: `pin_${i}` };
  }).filter((c) => c.cells > 2);

  const nextPass = new Date(Date.now() + ((5 - (new Date().getDay() % 5)) || 5) * 86400000);

  return (
    <Screen>
      <ScreenHeader title="Auto-scouting" sub={`Sentinel-2 L2A · 10 m · ${f.name}`} icon="earth" right={<Pill text={`PASS ${pass + 1}/10`} color={p.primary} icon="planet" />} />

      <Card pad={space.md}>
        <NdviMap cells={cells} />
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <Row gap={6}>
            <Chip label={playing ? 'Pause' : 'Play'} icon={playing ? 'pause' : 'play'} active onPress={() => setPlaying((v) => !v)} />
            <Chip label="Latest" icon="refresh" onPress={() => { setPlaying(false); setPass(9); }} />
          </Row>
          <T variant="micro" color={p.textDim}>NDVI {f.ndvi[pass]?.toFixed(2)} · median {median.toFixed(2)}</T>
        </Row>
        <Row gap={4} style={{ marginTop: space.sm }}>
          {['#7a3b12', '#a86a1e', '#c9a227', '#7fbf3f', '#2f9e44', '#137a3a'].map((c) => (
            <View key={c} style={{ flex: 1, height: 8, backgroundColor: c, borderRadius: 2 }} />
          ))}
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="micro" color={p.textFaint}>0.05 bare soil</T>
          <T variant="micro" color={p.textFaint}>0.95 dense canopy</T>
        </Row>
      </Card>

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Season NDVI" value={f.ndvi[f.ndvi.length - 1].toFixed(2)} sub={`peak ${Math.max(...f.ndvi).toFixed(2)}`} color={p.primary} icon="leaf" />
        <Stat label="Anomaly cells" value={`${anomalies.length}`} sub={`of ${GRID * GRID} (10 m)`} color={anomalies.length > 12 ? p.warn : p.ok} icon="warning" />
        <Stat label="Next pass" value={nextPass.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} sub="5-day revisit" color={p.water} icon="time" />
      </Row>

      <Card><Sparkline data={f.ndvi} height={70} color={p.primary} labels={['sow', 'veg', 'flower', 'fill', 'now']} /></Card>

      <SectionTitle title="Auto pin-drops" icon="location" />
      {clusters.length === 0 ? (
        <Banner kind="ok" icon="checkmark-circle" text="No significant NDVI depressions in this pass. Canopy is uniform — walk the field edges only." />
      ) : (
        clusters.map((c) => (
          <Card key={c.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={10} style={{ flex: 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: p.danger + '1F', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="location" size={17} color={p.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="h3">{c.cause}</T>
                  <T variant="micro" color={p.textDim}>
                    {(c.cells * 100).toFixed(0)} m² affected · {(c.severity * 100).toFixed(0)}% below field median · GPS {(f.lat + c.y * 0.00012).toFixed(5)}, {(f.lon + c.x * 0.00012).toFixed(5)}
                  </T>
                </View>
              </Row>
            </Row>
            <Row gap={space.sm} style={{ marginTop: space.sm }}>
              <Btn small kind="soft" icon="navigate" title="Navigate & scan" style={{ flex: 1 }} onPress={() => { push('scouting_task', { pin: c.id, lat: f.lat, lon: f.lon }); audit({ actor: s.profile.id, action: 'scouting:task', resource: `field:${f.id}`, outcome: 'allow' }); navigation.navigate('Tabs', { screen: 'Scan' }); }} />
              <Btn small kind="ghost" icon="water" title="Check irrigation" style={{ flex: 1 }} onPress={() => navigation.navigate('Irrigation')} />
            </Row>
          </Card>
        ))
      )}

      <SectionTitle title="How this works offline" icon="cloud-offline" />
      <Card>
        <KV k="Imagery source" v="Copernicus Sentinel-2 L2A (free, open licence)" />
        <KV k="Sync policy" v="Tiles fetched opportunistically when any mesh peer has uplink" />
        <KV k="On-device work" v="NDVI = (NIR − Red)/(NIR + Red), median filter, anomaly clustering" />
        <KV k="Storage" v="≈ 380 KB per field per pass (COG subset, cached)" />
        <KV k="Crop" v={`${CROPS[f.crop].emoji} ${CROPS[f.crop].name} · ${f.areaHa} ha`} />
        <Divider />
        <T variant="small" color={p.textDim}>Pin-drops are generated locally by comparing each 10 m cell with the field median, so the whole scouting loop keeps working during an outage.</T>
      </Card>
    </Screen>
  );
}

function NdviMap({ cells }: { cells: { v: number; x: number; y: number }[] }) {
  const { p } = useTheme();
  const [w, setW] = React.useState(300);
  const cell = w / GRID;
  const color = (v: number) => {
    const stops = [
      [0.05, '#7a3b12'], [0.25, '#a86a1e'], [0.4, '#c9a227'], [0.55, '#7fbf3f'], [0.7, '#2f9e44'], [0.95, '#0f5f2c'],
    ] as [number, string][];
    for (let i = stops.length - 1; i >= 0; i--) if (v >= stops[i][0]) return stops[i][1];
    return stops[0][1];
  };
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={w}>
        <Defs>
          <SvgGrad id="sheen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.12" />
          </SvgGrad>
        </Defs>
        <G>
          {cells.map((c) => (
            <Rect key={`${c.x}-${c.y}`} x={c.x * cell} y={c.y * cell} width={cell + 0.5} height={cell + 0.5} fill={color(c.v)} opacity={0.94} />
          ))}
          <Rect x={0} y={0} width={w} height={w} fill="url(#sheen)" />
          {cells.filter((c) => c.v < 0.35).slice(0, 3).map((c, i) => (
            <G key={`pin${i}`}>
              <Circle cx={c.x * cell + cell / 2} cy={c.y * cell + cell / 2} r={cell * 1.5} stroke="#FF6B6B" strokeWidth={2} fill="none" opacity={0.85} />
              <Circle cx={c.x * cell + cell / 2} cy={c.y * cell + cell / 2} r={3} fill="#FF6B6B" />
            </G>
          ))}
          <SvgText x={8} y={16} fontSize={10} fill={p.text} opacity={0.7}>NDVI · 10 m grid</SvgText>
        </G>
      </Svg>
    </View>
  );
}
