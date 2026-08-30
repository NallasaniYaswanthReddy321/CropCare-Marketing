import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, Gauge, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, Stat, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { allComponents, loadPixels, toPlanes } from '../lib/vision';
import { seededRandom } from '../lib/crypto';
import { activeField, fieldWeather } from '../lib/derive';

/** Water-sensitive paper reader: droplet count, coverage, VMD and CV of deposition. */
async function readSprayCard(uri: string) {
  const px = await loadPixels(uri, 220);
  const pl = toPlanes(px);
  const n = pl.w * pl.h;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    // stained spots are dark blue/violet on a yellow card
    const isStain = (pl.hue[i] > 180 && pl.hue[i] < 300 && pl.val[i] < 0.75) || pl.val[i] < 0.34;
    mask[i] = isStain ? 1 : 0;
  }
  const comps = allComponents(mask, pl.w, pl.h).filter((c) => c.area >= 2);
  const stained = comps.reduce((a, c) => a + c.area, 0);
  const coverage = (stained / n) * 100;
  // Standard card is 26 × 76 mm = 19.76 cm²
  const cardCm2 = 19.76;
  const density = comps.length / cardCm2;
  const pxPerMm = Math.sqrt((pl.w * pl.h) / (26 * 76));
  const diamsUm = comps.map((c) => (2 * Math.sqrt(c.area / Math.PI) / pxPerMm) * 1000 * 0.72); // 0.72 spread factor
  diamsUm.sort((a, b) => a - b);
  const totalVol = diamsUm.reduce((a, d) => a + d ** 3, 0);
  let acc = 0, vmd = diamsUm[Math.floor(diamsUm.length / 2)] ?? 0;
  for (const d of diamsUm) { acc += d ** 3; if (acc >= totalVol / 2) { vmd = d; break; } }
  // deposition uniformity across a 4×4 grid
  const cells = Array.from({ length: 16 }, () => 0);
  comps.forEach((c) => {
    const gx = Math.min(3, Math.floor((c.cx / pl.w) * 4));
    const gy = Math.min(3, Math.floor((c.cy / pl.h) * 4));
    cells[gy * 4 + gx]++;
  });
  const mean = cells.reduce((a, b) => a + b, 0) / 16;
  const sd = Math.sqrt(cells.reduce((a, b) => a + (b - mean) ** 2, 0) / 16);
  const cv = mean > 0 ? (sd / mean) * 100 : 100;
  return {
    drops: comps.length,
    density: +density.toFixed(1),
    coverage: +coverage.toFixed(1),
    vmd: Math.round(vmd),
    cv: Math.round(cv),
    cells,
    fine: diamsUm.filter((d) => d < 150).length / Math.max(1, diamsUm.length),
  };
}

function makeCard(quality: 'good' | 'sparse' | 'coarse'): string | null {
  if (Platform.OS !== 'web') return null;
  const doc = (globalThis as any).document;
  const canvas = doc.createElement('canvas');
  canvas.width = 260; canvas.height = 380;
  const c = canvas.getContext('2d');
  c.fillStyle = '#F3E24A';
  c.fillRect(0, 0, 260, 380);
  const rnd = seededRandom(quality);
  const count = quality === 'good' ? 620 : quality === 'sparse' ? 130 : 210;
  for (let i = 0; i < count; i++) {
    const r = quality === 'coarse' ? 3 + rnd() * 7 : 1.2 + rnd() * 3.2;
    const x = quality === 'sparse' ? rnd() ** 1.6 * 260 : rnd() * 260;
    const y = rnd() * 380;
    c.beginPath();
    c.ellipse(x, y, r, r * (0.85 + rnd() * 0.3), rnd() * 3, 0, Math.PI * 2);
    c.fillStyle = `rgba(${30 + rnd() * 25},${30 + rnd() * 30},${110 + rnd() * 60},${0.82 + rnd() * 0.18})`;
    c.fill();
  }
  return canvas.toDataURL('image/png');
}

export default function ARSprayScreen() {
  const { p } = useTheme();
  const { s, push, audit, passportAdd } = useApp();
  const f = activeField(s);
  const weather = React.useMemo(() => fieldWeather(f, 3), [f.id]);
  const [uri, setUri] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<any>(null);
  const [target, setTarget] = React.useState(25);
  const [boomH, setBoomH] = React.useState(50);

  const run = async (u: string) => {
    setBusy(true);
    setUri(u);
    try {
      const r = await readSprayCard(u);
      setRes(r);
      audit({ actor: s.profile.id, action: 'spray:verify', resource: `field:${f.id}`, outcome: 'info', meta: { density: r.density } });
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const r = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!r.canceled && r.assets?.[0]) run(r.assets[0].uri);
  };

  const wind = weather[0].windMs;
  const driftRisk = Math.min(1, (wind / 6) * (res ? 0.5 + res.fine : 1) * (boomH / 50));
  const pass = res ? res.density >= target * 0.8 && res.cv < 45 : false;

  return (
    <Screen>
      <ScreenHeader title="AR spray verification" sub="Photograph the water-sensitive card — proof, not guesswork" icon="scan-circle" right={<Pill text="ON-DEVICE CV" color={p.primary} />} />

      <Card pad={space.md}>
        <View style={{ aspectRatio: 0.7, borderRadius: radius.md, overflow: 'hidden', backgroundColor: p.surfaceStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.glassBorder }}>
          {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : (
            <View style={{ alignItems: 'center', gap: 8, padding: space.lg }}>
              <Ionicons name="document-outline" size={38} color={p.textFaint} />
              <T variant="small" color={p.textDim} center>Pin a 26 × 76 mm water-sensitive card in the canopy, spray, then photograph it flat.</T>
            </View>
          )}
          {busy ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={p.primary} />
              <T variant="small" color={p.primary} style={{ marginTop: 8 }}>Counting droplets…</T>
            </View>
          ) : null}
        </View>
        <Row gap={space.sm} style={{ marginTop: space.md }} wrap>
          <Btn small icon="camera" title="Photograph card" onPress={pick} style={{ flex: 1 }} />
          {Platform.OS === 'web' ? (
            <>
              <Chip label="Demo: good" onPress={() => { const u = makeCard('good'); if (u) run(u); }} />
              <Chip label="Demo: sparse" onPress={() => { const u = makeCard('sparse'); if (u) run(u); }} />
              <Chip label="Demo: coarse" onPress={() => { const u = makeCard('coarse'); if (u) run(u); }} />
            </>
          ) : null}
        </Row>
      </Card>

      {res ? (
        <>
          <Row gap={space.md} style={{ marginBottom: space.md }}>
            <Card style={{ flex: 1, marginBottom: 0, alignItems: 'center' }}>
              <Gauge value={res.density} max={Math.max(50, target * 2)} label="DROPS/cm²" color={pass ? p.ok : p.warn} size={130} />
              <T variant="micro" color={p.textDim}>target ≥ {target}</T>
            </Card>
            <View style={{ flex: 1, gap: space.sm }}>
              <Card pad={space.md} style={{ marginBottom: 0 }}>
                <T variant="micro" color={p.textDim}>COVERAGE</T>
                <T variant="h2" color={res.coverage > 15 ? p.ok : p.warn}>{res.coverage}%</T>
              </Card>
              <Card pad={space.md} style={{ marginBottom: 0 }}>
                <T variant="micro" color={p.textDim}>VMD</T>
                <T variant="h2">{res.vmd} µm</T>
              </Card>
              <Card pad={space.md} style={{ marginBottom: 0 }}>
                <T variant="micro" color={p.textDim}>UNIFORMITY CV</T>
                <T variant="h2" color={res.cv < 45 ? p.ok : p.danger}>{res.cv}%</T>
              </Card>
            </View>
          </Row>

          <Banner
            kind={pass ? 'ok' : 'warn'}
            icon={pass ? 'checkmark-circle' : 'alert-circle'}
            text={pass
              ? `Deposition passes: ${res.drops} droplets counted, ${res.density}/cm² at ${res.cv}% CV. This spray will actually reach the pest.`
              : `Deposition is below target (${res.density}/cm² vs ${target} needed, CV ${res.cv}%). Reduce speed, lower the boom, or switch to a finer nozzle — otherwise you paid for chemical that never landed.`}
          />

          <Card>
            <SectionTitle title="Deposition map (4 × 4)" icon="grid" />
            <Row gap={4} wrap>
              {res.cells.map((c: number, i: number) => {
                const rel = c / Math.max(1, Math.max(...res.cells));
                return (
                  <View key={i} style={{ width: '23%', aspectRatio: 1.6, borderRadius: 8, backgroundColor: `rgba(110,231,135,${0.15 + rel * 0.75})`, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                    <T variant="micro" color={p.text}>{c}</T>
                  </View>
                );
              })}
            </Row>
            <T variant="micro" color={p.textFaint}>Counts per quadrant. A CV above 45% means streaking — usually a blocked nozzle or the boom is too high.</T>
          </Card>

          <Card>
            <SectionTitle title="Drift check" icon="navigate" />
            <Slider label="Target density for this product" value={target} min={10} max={70} step={1} unit=" /cm²" onChange={setTarget} />
            <Slider label="Boom / nozzle height" value={boomH} min={25} max={120} step={5} unit=" cm" onChange={setBoomH} color={p.water} />
            <KV k="Wind now" v={`${wind} m/s`} color={wind > 4.5 ? p.danger : p.ok} />
            <KV k="Fine droplets (< 150 µm)" v={`${(res.fine * 100).toFixed(0)}% — highest drift fraction`} color={res.fine > 0.5 ? p.warn : p.ok} />
            <KV k="Estimated drift risk" v={`${(driftRisk * 100).toFixed(0)}%`} color={driftRisk > 0.5 ? p.danger : p.ok} />
            <Bar value={driftRisk} color={driftRisk > 0.5 ? p.danger : p.ok} height={7} />
            <Banner kind="info" icon="bulb" text="Every 10 cm you lower the boom cuts drift roughly 15%. Spray below 4.5 m/s wind, and never towards a neighbour's flowering crop or a beehive." />
          </Card>

          <Btn
            title="Log verified spray to passport"
            icon="qr-code"
            style={{ marginBottom: space.xl }}
            onPress={() => {
              passportAdd({ event: 'input_applied', input: 'Verified spray application', drops_cm2: res.density, coverage_pct: res.coverage, cv_pct: res.cv });
              push('spray_verified', { density: res.density, coverage: res.coverage });
            }}
          />
        </>
      ) : (
        <Card>
          <SectionTitle title="Why verify?" icon="help-circle" />
          {[
            'Most "the spray did not work" complaints are deposition failures, not product failures.',
            'Fungicides need 20–30 droplets/cm² of coverage; contact insecticides need 30–40.',
            'The card reader runs entirely on the phone — threshold, connected components, VMD from the droplet size distribution.',
            'Results attach to the Farm Passport, which is what a buyer or an auditor can actually check.',
          ].map((x) => (
            <Row key={x} gap={8} style={{ paddingVertical: 5, alignItems: 'flex-start' }}>
              <Ionicons name="checkmark-circle" size={14} color={p.ok} style={{ marginTop: 2 }} />
              <T variant="small" color={p.textDim} style={{ flex: 1 }}>{x}</T>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}
