import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, G } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnswerCard, Banner, Btn, Card, Chip, Divider, KV, MultiLine, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, Stat, T } from '../components/ui';
import FarmTwin from '../components/FarmTwin';
import { OverflowMenu } from '../components/Menu';
import { SOILS as SOIL_TABLE } from '../lib/agro';
import { fieldIrrigation, fieldWeather } from '../lib/derive';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS, aquaCropLite, phenology, seir, SOILS } from '../lib/agro';
import { activeField, daysAfterSowing } from '../lib/derive';
import { climatology } from '../lib/weather';
import { inr, priceRange } from '../lib/price';
import { seededRandom } from '../lib/crypto';

export default function TwinScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s } = useApp();
  const f = activeField(s);
  const crop = CROPS[f.crop];

  const [irrigationPct, setIrrigationPct] = React.useState(100);
  const [tempAnomaly, setTempAnomaly] = React.useState(0);
  const [rainAnomaly, setRainAnomaly] = React.useState(0);
  const [nitrogen, setNitrogen] = React.useState(100);
  const [protection, setProtection] = React.useState(60);
  const [sowShift, setSowShift] = React.useState(0);
  const [hourOverride, setHourOverride] = React.useState<number | null>(null);
  const [showSoil, setShowSoil] = React.useState(true);

  /** Live, unmodified state of this field today — the twin renders THIS. */
  const liveWeather = React.useMemo(() => fieldWeather(f, 3), [f.id]);
  const today = liveWeather[0];
  const liveIrr = React.useMemo(() => fieldIrrigation(f, liveWeather), [f.id, f.depletionMm]);
  const diseaseNow = React.useMemo(() => {
    const last = s.scans.find((x) => x.kind === 'disease' && x.fieldId === f.id);
    return last ? Math.min(1, last.score / 100) : 0;
  }, [s.scans, f.id]);

  const season = crop.stages.ini + crop.stages.dev + crop.stages.mid + crop.stages.late;

  const build = (scenario: boolean) => {
    const base = climatology(`${f.id}:twin`, season, 1 + (scenario ? sowShift : 0), f.lat);
    const w = base.map((d) => ({
      ...d,
      tMax: d.tMax + (scenario ? tempAnomaly : 0),
      tMin: d.tMin + (scenario ? tempAnomaly : 0),
      rainMm: Math.max(0, d.rainMm * (1 + (scenario ? rainAnomaly / 100 : 0))),
    }));
    const irrFactor = scenario ? irrigationPct / 100 : 1;
    const rnd = seededRandom(f.id + scenario);
    const crops = aquaCropLite({
      crop, soil: f.soil, days: season, weather: w, latitude: f.lat, elevationM: 560,
      irrigationMm: (day) => (day % 4 === 0 ? 22 * irrFactor : 0),
      nutrientStress: scenario ? Math.max(0, (100 - nitrogen) / 260) : 0,
      pestLoss: scenario ? Math.max(0, (100 - protection) / 320) : 0.06,
    });
    const ph = phenology(crop, w.map((d) => ({ tMin: d.tMin, tMax: d.tMax })));
    const epi = seir({
      days: 30, beta0: 0.55, sigma: 0.32, gamma: 0.12, initialInfected: 0.02,
      rh: w.map((d) => d.rhMean), temp: w.map((d) => d.tMax),
      protection: scenario ? protection / 100 : 0.2,
    });
    return { crops, ph, epi, w, rnd };
  };

  const baseline = React.useMemo(() => build(false), [f.id]);
  const scenario = React.useMemo(() => build(true), [f.id, irrigationPct, tempAnomaly, rainAnomaly, nitrogen, protection, sowShift]);

  const price = priceRange({ crop: f.crop, qualityScore: 74, grade: 'B', quantityQuintal: 1 });
  const revenue = (t: number) => t * 10 * f.areaHa * price.mid;
  const dYield = scenario.crops.yieldTHa - baseline.crops.yieldTHa;
  const dRevenue = revenue(scenario.crops.yieldTHa) - revenue(baseline.crops.yieldTHa);
  const das = daysAfterSowing(f);

  const cc = scenario.crops.series[Math.min(scenario.crops.series.length - 1, das)]?.cc ?? 0.5;
  const ks = scenario.crops.series[Math.min(scenario.crops.series.length - 1, das)]?.ks ?? 1;
  const stageNow = scenario.ph.series[Math.min(scenario.ph.series.length - 1, das)]?.stage ?? 'Emergence';

  return (
    <Screen>
      <ScreenHeader
        title={s.settings.simple ? 'What if…' : 'Digital twin'}
        sub={`${f.name} · ${crop.name} · ${f.areaHa} ha · ${SOILS[f.soil].name} soil`}
        icon="cube"
        right={
          <Row gap={6}>
            <Pill text="LIVE" color={p.ok} icon="ellipse" />
            <OverflowMenu
              items={[
                { icon: 'time', label: hourOverride === null ? 'Show a different hour' : 'Back to now', hint: hourOverride === null ? 'Watch the field through the day' : `Currently ${hourOverride}:00`, onPress: () => setHourOverride(hourOverride === null ? 6 : null), tone: 'primary' },
                { icon: 'layers', label: showSoil ? 'Hide underground view' : 'Show underground view', check: showSoil, onPress: () => setShowSoil((v) => !v) },
                { icon: 'water', label: 'Open water plan', onPress: () => navigation.navigate('Irrigation') },
                { icon: 'leaf', label: 'Crop details', onPress: () => navigation.navigate('CropDetail', { crop: f.crop }) },
                { icon: 'map', label: 'Field map', onPress: () => navigation.navigate('FieldMap') },
                { icon: 'refresh', label: 'Reset all sliders', tone: 'danger', onPress: () => { setIrrigationPct(100); setTempAnomaly(0); setRainAnomaly(0); setNitrogen(100); setProtection(60); setSowShift(0); } },
              ]}
            />
          </Row>
        }
      />

      {/* ---------------- the living picture of this field ---------------- */}
      <Card pad={space.md}>
        <FarmTwin
          crop={f.crop}
          cc={cc}
          ks={ks}
          maturity={scenario.ph.pct}
          stage={stageNow}
          depletionMm={liveIrr.depletion}
          tawMm={liveIrr.taw}
          rawMm={liveIrr.raw}
          rainMm={Math.max(0, today.rainMm * (1 + rainAnomaly / 100))}
          tMaxC={today.tMax + tempAnomaly}
          rhPct={today.rhMean}
          windMs={today.windMs}
          disease={diseaseNow}
          nitrogen={nitrogen / 100}
          rootDepthM={crop.rootDepth}
          hour={hourOverride ?? undefined}
          seed={f.id}
          height={showSoil ? 320 : 250}
          showSoil={showSoil}
        />
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="micro" color={p.textDim}>
            DAY {das} OF {season} · {stageNow.toUpperCase()} · CANOPY {(cc * 100).toFixed(0)}%
          </T>
          <T variant="micro" color={p.textFaint}>
            {hourOverride === null ? 'LIVE NOW' : `${String(hourOverride).padStart(2, '0')}:00`}
          </T>
        </Row>
        {hourOverride !== null ? (
          <Slider label="Hour of day" value={hourOverride} min={0} max={23} step={1} unit=":00" onChange={setHourOverride} color={p.sun} />
        ) : null}
      </Card>

      <AnswerCard
        tone={ks < 0.8 ? 'danger' : ks < 0.95 ? 'warn' : 'ok'}
        headline={
          ks < 0.8 ? 'Your crop is thirsty right now'
            : ks < 0.95 ? 'Mild thirst starting'
              : 'The crop is comfortable today'
        }
        detail={
          ks < 0.8
            ? `The picture above shows drooping leaves because ${liveIrr.depletion} mm of the ${liveIrr.taw} mm your soil can hold is already used. Below ${liveIrr.raw} mm the plant closes its pores and stops growing.`
            : ks < 0.95
              ? `${liveIrr.depletion} mm used of ${liveIrr.taw} mm. Still fine, but the refill line is at ${liveIrr.raw} mm — plan water within ${liveIrr.nextCheckDays} day(s).`
              : `Roots are finding water easily. ${Math.max(0, liveIrr.taw - liveIrr.depletion)} mm still available in the root zone.`
        }
        onSpeak={() => speak(
          ks < 0.8
            ? 'Your crop is thirsty. The leaves are drooping because the soil water is used up. Give water today.'
            : 'The crop is comfortable today. Roots are finding water easily.',
          voiceLocale(s.profile.lang),
        )}
      />

      <SectionTitle title="What-if levers" icon="options" />
      <Card>
        <Slider label="Irrigation applied" value={irrigationPct} min={0} max={150} step={5} unit="%" onChange={setIrrigationPct} color={p.water} />
        <Slider label="Temperature anomaly" value={tempAnomaly} min={-4} max={6} step={0.5} unit=" °C" onChange={setTempAnomaly} color={p.sun} />
        <Slider label="Rainfall anomaly" value={rainAnomaly} min={-80} max={120} step={5} unit="%" onChange={setRainAnomaly} color={p.water} />
        <Slider label="Nitrogen programme" value={nitrogen} min={0} max={140} step={5} unit="%" onChange={setNitrogen} color={p.accent} />
        <Slider label="Crop protection level" value={protection} min={0} max={95} step={5} unit="%" onChange={setProtection} color={p.primary} />
        <Slider label="Sowing shift" value={sowShift} min={-30} max={30} step={1} unit=" d" onChange={setSowShift} color={p.soil} />
        <Row gap={space.sm}>
          <Btn small kind="ghost" title="Reset" icon="refresh" style={{ flex: 1 }} onPress={() => { setIrrigationPct(100); setTempAnomaly(0); setRainAnomaly(0); setNitrogen(100); setProtection(60); setSowShift(0); }} />
          <Btn small kind="soft" title="Drought 2024" icon="flame" style={{ flex: 1 }} onPress={() => { setRainAnomaly(-70); setTempAnomaly(3); setIrrigationPct(60); }} />
          <Btn small kind="soft" title="Wet year" icon="rainy" style={{ flex: 1 }} onPress={() => { setRainAnomaly(80); setTempAnomaly(-1); setProtection(85); }} />
        </Row>
      </Card>

      <SectionTitle title="Projected outcome" icon="trending-up" />
      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Yield" value={`${scenario.crops.yieldTHa} t/ha`} sub={`baseline ${baseline.crops.yieldTHa}`} color={dYield >= 0 ? p.ok : p.danger} icon="basket" />
        <Stat label="Water" value={`${scenario.crops.waterUsedMm} mm`} sub={`WUE ${scenario.crops.wue} kg/m³`} color={p.water} icon="water" />
        <Stat label="Stress days" value={`${scenario.crops.stressDays}`} sub={`of ${season} days`} color={scenario.crops.stressDays > 25 ? p.warn : p.ok} icon="thermometer" />
      </Row>
      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="micro" color={p.textDim}>REVENUE DELTA VS BASELINE ({f.areaHa} HA)</T>
            <T variant="h1" color={dRevenue >= 0 ? p.ok : p.danger}>{dRevenue >= 0 ? '+' : '−'}{inr(Math.abs(dRevenue))}</T>
          </View>
          <Ionicons name={dRevenue >= 0 ? 'arrow-up-circle' : 'arrow-down-circle'} size={40} color={dRevenue >= 0 ? p.ok : p.danger} />
        </Row>
        <T variant="micro" color={p.textFaint}>Valued at the current estimated price range midpoint of {inr(price.mid)}/quintal — an AI estimate, not a guarantee.</T>
      </Card>

      <SectionTitle title="Canopy & biomass trajectory" icon="stats-chart" />
      <Card>
        <MultiLine
          height={150}
          series={[
            { data: baseline.crops.series.map((x) => x.cc * 100), color: p.textFaint, name: 'Baseline canopy %' },
            { data: scenario.crops.series.map((x) => x.cc * 100), color: p.primary, name: 'Scenario canopy %' },
            { data: scenario.crops.series.map((x) => x.ks * 100), color: p.water, name: 'Water stress Ks ×100' },
          ]}
          labels={['sow', '¼', '½', '¾', 'harvest']}
        />
        <Divider />
        <KV k="Thermal time accumulated" v={`${scenario.ph.series[scenario.ph.series.length - 1]?.cum.toFixed(0)} °Cd of ${crop.gddToMaturity}`} />
        <KV k="Wang-Engel maturity day" v={scenario.ph.maturityDay ? `day ${scenario.ph.maturityDay}` : `not reached in ${season} days`} color={scenario.ph.maturityDay ? p.ok : p.warn} />
        <KV k="Baseline maturity day" v={baseline.ph.maturityDay ? `day ${baseline.ph.maturityDay}` : '—'} />
        <KV k="Stage now" v={scenario.ph.series[Math.min(scenario.ph.series.length - 1, das)]?.stage ?? '—'} />
      </Card>

      <SectionTitle title="Disease pressure under this scenario" icon="bug" />
      <Card>
        <MultiLine
          height={130}
          series={[
            { data: baseline.epi.series.map((x) => x.I * 100), color: p.textFaint, name: 'Baseline infected %' },
            { data: scenario.epi.series.map((x) => x.I * 100), color: p.danger, name: 'Scenario infected %' },
          ]}
          labels={['day 1', 'day 10', 'day 20', 'day 30']}
        />
        <KV k="R₀ under scenario" v={`${scenario.epi.r0}`} color={scenario.epi.r0 > 1 ? p.danger : p.ok} />
        <KV k="Peak infected tissue" v={`${(scenario.epi.peakInfected * 100).toFixed(0)}% on day ${scenario.epi.peakDay}`} />
        <Banner
          kind={scenario.epi.r0 > 1 ? 'warn' : 'ok'}
          icon="shield"
          text={scenario.epi.r0 > 1
            ? `At ${protection}% protection the epidemic still grows (R₀ ${scenario.epi.r0}). Raising protection to about ${Math.min(95, Math.round(protection + 20))}% pushes R₀ below 1.`
            : `Protection at ${protection}% holds R₀ below 1 — the outbreak fades on its own under this weather path.`}
        />
      </Card>

      <Row gap={space.sm} style={{ marginBottom: space.xl }}>
        <Btn title="Irrigation plan" icon="water" style={{ flex: 1 }} onPress={() => navigation.navigate('Irrigation')} />
        <Btn title="Ask agronomist" kind="ghost" icon="chatbubbles" style={{ flex: 1 }} onPress={() => navigation.navigate('Advisor')} />
      </Row>
    </Screen>
  );
}

/** Isometric field render — canopy cover drives per-plot colour and height. */
function IsoField({ cc, ks, seed }: { cc: number; ks: number; seed: string }) {
  const { p } = useTheme();
  const [w, setW] = React.useState(320);
  const N = 9;
  const tileW = w / (N + 1.2);
  const tileH = tileW * 0.52;
  const h = tileH * (N + 3) + 40;
  const rnd = React.useMemo(() => seededRandom(seed), [seed]);
  const noise = React.useMemo(() => Array.from({ length: N * N }, () => rnd()), [seed]);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ alignItems: 'center' }}>
      <Svg width="100%" height={h}>
        <G>
          {Array.from({ length: N }).map((_, r) =>
            Array.from({ length: N }).map((__, c) => {
              const n = noise[r * N + c];
              const vigour = Math.max(0.05, Math.min(1, cc * (0.75 + n * 0.5) * (0.6 + 0.4 * ks)));
              const lift = vigour * tileH * 1.5;
              const cx = w / 2 + (c - r) * (tileW / 2);
              const cy = 26 + (c + r) * (tileH / 2) - lift;
              const hue = 95 + vigour * 30 - (1 - ks) * 45;
              const lightness = 18 + vigour * 30;
              const top = `${cx},${cy - tileH / 2} ${cx + tileW / 2},${cy} ${cx},${cy + tileH / 2} ${cx - tileW / 2},${cy}`;
              const left = `${cx - tileW / 2},${cy} ${cx},${cy + tileH / 2} ${cx},${cy + tileH / 2 + lift} ${cx - tileW / 2},${cy + lift}`;
              const right = `${cx + tileW / 2},${cy} ${cx},${cy + tileH / 2} ${cx},${cy + tileH / 2 + lift} ${cx + tileW / 2},${cy + lift}`;
              return (
                <G key={`${r}-${c}`}>
                  <Polygon points={left} fill={`hsl(30,25%,${12 + n * 6}%)`} />
                  <Polygon points={right} fill={`hsl(30,22%,${8 + n * 5}%)`} />
                  <Polygon points={top} fill={`hsl(${hue},${45 + vigour * 25}%,${lightness}%)`} stroke={p.bg} strokeWidth={0.6} />
                </G>
              );
            }),
          )}
        </G>
      </Svg>
    </View>
  );
}
