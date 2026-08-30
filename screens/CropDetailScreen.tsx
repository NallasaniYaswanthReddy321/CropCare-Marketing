import React from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnswerCard, Banner, Bar, Btn, Card, Chip, Divider, Gauge, KV, MultiLine, PicturePicker, Pill,
  Row, Screen, ScreenHeader, SectionTitle, Sparkline, Stat, T,
} from '../components/ui';
import { OverflowMenu } from '../components/Menu';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS, CropKey, kcForDay } from '../lib/agro';
import { CROP_INFO, waterNeedNow } from '../lib/cropinfo';
import { CROP_IMG } from '../lib/images';
import { activeField, daysAfterSowing, fieldSummary, fieldWeather } from '../lib/derive';
import { inr, priceRange } from '../lib/price';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';

export default function CropDetailScreen({ route, navigation }: any) {
  const { p } = useTheme();
  const { s } = useApp();
  const f = activeField(s);
  const [crop, setCrop] = React.useState<CropKey>(route?.params?.crop ?? f.crop);
  const [tab, setTab] = React.useState<'water' | 'grow' | 'protect' | 'sell'>('water');

  const spec = CROPS[crop];
  const info = CROP_INFO[crop];
  const isMine = f.crop === crop;
  const das = isMine ? daysAfterSowing(f) : 0;
  const sum = React.useMemo(() => fieldSummary(f), [f.id, f.depletionMm]);
  const weather = React.useMemo(() => fieldWeather(f, 10), [f.id]);
  const season = spec.stages.ini + spec.stages.dev + spec.stages.mid + spec.stages.late;

  // Live water requirement for THIS field today.
  const kc = kcForDay(spec, das);
  const etcToday = isMine ? sum.irr.etc : +(sum.irr.et0 * kc.kc).toFixed(2);
  const need = waterNeedNow(crop, das, etcToday, f.areaHa);

  // Water demand curve across the whole season (ET0 × Kc by stage).
  const demandCurve = React.useMemo(
    () => Array.from({ length: 24 }, (_, i) => {
      const day = Math.round((i / 23) * season);
      return +(sum.irr.et0 * kcForDay(spec, day).kc).toFixed(2);
    }),
    [crop, sum.irr.et0, season],
  );
  const rainCurve = React.useMemo(
    () => Array.from({ length: 24 }, (_, i) => weather[i % weather.length].rainMm),
    [weather],
  );

  const price = priceRange({ crop, qualityScore: 75, grade: 'B', quantityQuintal: 1 });
  const midYield = (info.yieldTHa[0] + info.yieldTHa[1]) / 2;
  const grossPerHa = midYield * 10 * price.mid;

  const speakWater = () => speak(
    isMine
      ? `Your ${spec.name} needs about ${etcToday} millimetres of water today. That is ${Math.round(need.perDayLitres / 1000)} thousand litres for ${f.areaHa} hectare. ${sum.irr.irrigateNow ? 'Give water today.' : 'No water needed today.'}`
      : `${spec.name} needs between ${info.waterMm[0]} and ${info.waterMm[1]} millimetres over the whole season.`,
    voiceLocale(s.profile.lang),
  );

  return (
    <Screen>
      <ScreenHeader
        title={spec.name}
        sub={`${info.family} · ${season} day season · ${info.season.join(' / ')}`}
        icon="leaf"
        right={
          <Row gap={6}>
            {isMine ? <Pill text={`DAY ${das}`} color={p.primary} icon="calendar" /> : null}
            <OverflowMenu
              items={[
                { icon: 'water', label: 'Open water plan', onPress: () => navigation.navigate('Irrigation'), tone: 'primary' },
                { icon: 'cube', label: 'See it in the twin', onPress: () => navigation.navigate('Twin') },
                { icon: 'map', label: 'Field map', onPress: () => navigation.navigate('FieldMap') },
                { icon: 'pricetag', label: 'What price today?', onPress: () => navigation.navigate('Tabs', { screen: 'Market' }) },
                { icon: 'flower', label: 'Which variety?', onPress: () => navigation.navigate('Seeds') },
                { icon: 'volume-high', label: 'Read this aloud', onPress: speakWater },
              ]}
            />
          </Row>
        }
      />

      {/* crop switcher with pictures */}
      <PicturePicker
        value={crop}
        onChange={(k) => setCrop(k as CropKey)}
        items={Object.values(CROPS).map((c) => ({ key: c.key, label: c.name, image: CROP_IMG[c.key] }))}
      />

      {/* hero */}
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.md, borderWidth: 1, borderColor: p.glassBorder }}>
        <Image source={CROP_IMG[crop]} style={{ width: '100%', height: 150 }} contentFit="cover" />
      </View>

      {isMine ? (
        <AnswerCard
          tone={sum.irr.irrigateNow ? 'warn' : 'ok'}
          headline={sum.irr.irrigateNow
            ? `Give ${sum.irr.grossDepthMm} mm today`
            : `No water needed today`}
          detail={`Your ${spec.name.toLowerCase()} is ${das} days old and drinking about ${etcToday} mm a day right now — roughly ${Math.round(need.perDayLitres / 1000)} thousand litres across ${f.areaHa} ha. Stage: ${kc.stage}.`}
          image={CROP_IMG[crop]}
          onSpeak={speakWater}
          action={<Btn small title="Open water plan" icon="water" onPress={() => navigation.navigate('Irrigation')} />}
        />
      ) : (
        <Banner kind="info" icon="information-circle" text={`You are not growing ${spec.name.toLowerCase()} in ${f.name} right now, so the numbers below are for a typical field in your area.`} />
      )}

      <Row gap={8} wrap style={{ marginBottom: space.md }}>
        {([['water', 'Water', 'water'], ['grow', 'How to grow', 'leaf'], ['protect', 'Protect', 'shield-half'], ['sell', 'Money', 'cash']] as const).map(([id, label, icon]) => (
          <Chip key={id} label={label} icon={icon} active={tab === id} onPress={() => setTab(id)} />
        ))}
      </Row>

      {/* -------------------------------- WATER -------------------------------- */}
      {tab === 'water' ? (
        <>
          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <Stat label="Needs today" value={`${etcToday} mm`} sub={`${Math.round(need.perDayLitres / 1000)} kL on ${f.areaHa} ha`} color={p.water} icon="water" />
            <Stat label="Whole season" value={`${info.waterMm[0]}–${info.waterMm[1]}`} sub="mm of water" color={p.accent} icon="calendar" />
            <Stat label="Sensitivity" value={`Ky ${info.ky}`} sub={info.ky > 1 ? 'very sensitive' : 'tolerant'} color={info.ky > 1 ? p.warn : p.ok} icon="pulse" />
          </Row>

          <Card>
            <SectionTitle title="Water demand through the season" icon="analytics" />
            <MultiLine
              height={150}
              series={[
                { data: demandCurve, color: p.water, name: 'Water the crop wants (mm/day)' },
                { data: rainCurve, color: p.primary, name: 'Rain you may get (mm/day)' },
              ]}
              labels={['sowing', 'growing', 'flowering', 'filling', 'harvest']}
            />
            <Divider />
            <T variant="small" color={p.textDim}>
              The blue line is what the crop drinks each day — it rises as leaves grow and falls again as the crop ripens.
              Where blue sits above green, you must supply the difference.
            </T>
            {isMine ? (
              <>
                <Divider />
                <KV k="Today's crop coefficient (Kc)" v={`${kc.kc.toFixed(2)} · ${kc.stage}`} />
                <KV k="Reference evaporation (ET₀)" v={`${sum.irr.et0} mm/day`} />
                <KV k="Your crop's use (ETc)" v={`${etcToday} mm/day`} color={p.water} />
                <KV k="Water still to come this season" v={`${need.remainingMm} mm over ${need.remainingDays} days`} />
              </>
            ) : null}
          </Card>

          <SectionTitle title="When water matters most" icon="alert-circle" />
          {info.criticalStages.map((cs, i) => (
            <Card key={cs.stage} pad={space.md}>
              <Row gap={10}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.water + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <T variant="small" color={p.water}>{i + 1}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="h3">{cs.stage}</T>
                  <T variant="small" color={p.textDim}>{cs.why}</T>
                </View>
              </Row>
            </Card>
          ))}

          <Card>
            <SectionTitle title="What a shortage costs you" icon="trending-down" />
            <T variant="small" color={p.textDim} style={{ marginBottom: space.sm }}>
              With a water-response factor of Ky {info.ky}, missing water hurts this crop as follows:
            </T>
            {[10, 20, 30, 50].map((deficit) => {
              const loss = need.lossIfShort(deficit);
              const money = Math.round((loss / 100) * grossPerHa * f.areaHa);
              return (
                <View key={deficit} style={{ marginBottom: space.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T variant="small">{deficit}% short of water</T>
                    <T variant="small" color={loss > 30 ? p.danger : p.warn}>−{loss}% yield · about {inr(money)}</T>
                  </Row>
                  <Bar value={loss} max={100} color={loss > 30 ? p.danger : p.warn} height={6} />
                </View>
              );
            })}
            <T variant="micro" color={p.textFaint}>FAO-33 yield response method, valued at today's estimated price of {inr(price.mid)}/quintal.</T>
          </Card>
        </>
      ) : null}

      {/* --------------------------------- GROW -------------------------------- */}
      {tab === 'grow' ? (
        <>
          <Card>
            <SectionTitle title="Planting" icon="leaf" />
            <KV k="Season" v={info.season.join(', ')} />
            <KV k="How to sow" v={info.sowing} />
            <KV k="Spacing" v={info.spacing} />
            <KV k="Seed rate" v={info.seedRate} />
            <KV k="Days to harvest" v={`${season} days`} />
            <KV k="Rooting depth" v={`${(spec.rootDepth * 100).toFixed(0)} cm`} />
          </Card>

          <Card>
            <SectionTitle title="Feeding the crop" icon="flask" />
            <Row gap={space.sm} style={{ marginBottom: space.sm }}>
              <Stat label="Nitrogen" value={`${info.nutrients.n}`} sub="kg N/ha" color={p.primary} icon="leaf" />
              <Stat label="Phosphorus" value={`${info.nutrients.p}`} sub="kg P₂O₅/ha" color={p.accent} icon="flame" />
              <Stat label="Potassium" value={`${info.nutrients.k}`} sub="kg K₂O/ha" color={p.sun} icon="nutrition" />
            </Row>
            <Banner kind="info" icon="calendar" text={info.nutrientSplit} />
            <KV k="For your field" v={`${Math.round(info.nutrients.n * f.areaHa)} kg N, ${Math.round(info.nutrients.p * f.areaHa)} kg P₂O₅, ${Math.round(info.nutrients.k * f.areaHa)} kg K₂O on ${f.areaHa} ha`} />
            <T variant="micro" color={p.textFaint} style={{ marginTop: 6 }}>
              Always adjust to your soil test. These are general recommendations for {s.geo?.zone ?? 'your zone'}.
            </T>
          </Card>

          <Card>
            <SectionTitle title="Growth stages" icon="stats-chart" />
            {[
              { n: 'Establishment', d: spec.stages.ini, c: p.primary },
              { n: 'Vegetative growth', d: spec.stages.dev, c: p.ok },
              { n: 'Flowering / filling', d: spec.stages.mid, c: p.sun },
              { n: 'Ripening', d: spec.stages.late, c: p.accent },
            ].map((st) => {
              const pct = (st.d / season) * 100;
              return (
                <View key={st.n} style={{ marginBottom: space.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T variant="small">{st.n}</T>
                    <T variant="small" color={p.textDim}>{st.d} days</T>
                  </Row>
                  <Bar value={pct} max={100} color={st.c} height={7} />
                </View>
              );
            })}
            {isMine ? (
              <Banner kind="ok" icon="location" text={`You are on day ${das} of ${season} — currently in ${kc.stage.toLowerCase()}.`} />
            ) : null}
          </Card>

          <Card>
            <SectionTitle title="Rotation" icon="repeat" />
            <T variant="small" color={p.textDim}>{info.rotation}</T>
          </Card>
        </>
      ) : null}

      {/* ------------------------------- PROTECT ------------------------------- */}
      {tab === 'protect' ? (
        <>
          <SectionTitle title="Pests to watch for" icon="bug" />
          {info.pests.map((x) => (
            <Card key={x.name}>
              <T variant="h3">{x.name}</T>
              <Row gap={8} style={{ marginTop: 6, alignItems: 'flex-start' }}>
                <Ionicons name="eye" size={14} color={p.warn} style={{ marginTop: 3 }} />
                <T variant="small" color={p.textDim} style={{ flex: 1 }}>You will see: {x.sign}</T>
              </Row>
              <Row gap={8} style={{ marginTop: 4, alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle" size={14} color={p.ok} style={{ marginTop: 3 }} />
                <T variant="small" style={{ flex: 1 }}>Do this: {x.act}</T>
              </Row>
            </Card>
          ))}

          <SectionTitle title="Diseases to watch for" icon="medkit" />
          {info.diseases.map((x) => (
            <Card key={x.name}>
              <T variant="h3">{x.name}</T>
              <Row gap={8} style={{ marginTop: 6, alignItems: 'flex-start' }}>
                <Ionicons name="eye" size={14} color={p.warn} style={{ marginTop: 3 }} />
                <T variant="small" color={p.textDim} style={{ flex: 1 }}>You will see: {x.sign}</T>
              </Row>
              <Row gap={8} style={{ marginTop: 4, alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle" size={14} color={p.ok} style={{ marginTop: 3 }} />
                <T variant="small" style={{ flex: 1 }}>Do this: {x.act}</T>
              </Row>
            </Card>
          ))}

          <Card>
            <SectionTitle title="Mistakes that cost the most" icon="warning" />
            {info.mistakes.map((m) => (
              <Row key={m} gap={9} style={{ paddingVertical: 6, alignItems: 'flex-start' }}>
                <Ionicons name="close-circle" size={15} color={p.danger} style={{ marginTop: 2 }} />
                <T variant="small" color={p.textDim} style={{ flex: 1 }}>{m}</T>
              </Row>
            ))}
          </Card>

          <Btn title="Photograph a sick plant" icon="camera" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' })} style={{ marginBottom: space.md }} />
        </>
      ) : null}

      {/* --------------------------------- SELL -------------------------------- */}
      {tab === 'sell' ? (
        <>
          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <Stat label="Typical yield" value={`${info.yieldTHa[0]}–${info.yieldTHa[1]}`} sub="tonnes/ha" color={p.primary} icon="basket" />
            <Stat label="Price now" value={inr(price.mid)} sub="per quintal (estimate)" color={p.sun} icon="pricetag" />
            <Stat label="Gross/ha" value={inr(grossPerHa)} sub="at mid yield" color={p.accent} icon="cash" />
          </Row>

          <Card>
            <SectionTitle title="Harvest" icon="cut" />
            <T variant="small" color={p.textDim}>{info.harvest}</T>
            <Divider />
            <SectionTitle title="Storage" icon="snow" />
            <T variant="small" color={p.textDim}>{info.storage}</T>
            <KV k="Recommended temperature" v={`${spec.coldChain.tempC[0]}–${spec.coldChain.tempC[1]} °C`} />
            <KV k="Recommended humidity" v={`${spec.coldChain.rh[0]}–${spec.coldChain.rh[1]}% RH`} />
            <KV k="Shelf life at room temperature" v={spec.shelfLifeH >= 720 ? `${Math.round(spec.shelfLifeH / 720)} months` : `${Math.round(spec.shelfLifeH / 24)} days`} />
            <KV k="Ethylene" v={spec.coldChain.ethyleneSensitive ? 'Sensitive — store away from ripening fruit' : 'Not sensitive'} color={spec.coldChain.ethyleneSensitive ? p.warn : p.ok} />
          </Card>

          <Card>
            <SectionTitle title="What your field could earn" icon="calculator" />
            <KV k="Field size" v={`${f.areaHa} ha`} />
            <KV k="Expected yield" v={`${(midYield * f.areaHa).toFixed(1)} t (${(midYield * f.areaHa * 10).toFixed(0)} quintal)`} />
            <KV k="At estimated price" v={`${inr(price.low)}–${inr(price.high)} per quintal`} />
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3">Gross value</T>
              <T variant="h2" color={p.primary}>{inr(grossPerHa * f.areaHa)}</T>
            </Row>
            <Banner kind="warn" icon="alert-circle" text="This is an AI estimate from a price range, before your costs. It is not a guaranteed price." />
            <Row gap={space.sm}>
              <Btn small title="Best market today" icon="git-compare" style={{ flex: 1 }} onPress={() => navigation.navigate('Tabs', { screen: 'Market' })} />
              <Btn small kind="ghost" title="Store or sell?" icon="snow" style={{ flex: 1 }} onPress={() => navigation.navigate('ColdChain')} />
            </Row>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
