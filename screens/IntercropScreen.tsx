import React from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Rect, G } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { COMPANIONS, CROPS, CropKey } from '../lib/agro';
import { inr, priceRange } from '../lib/price';
import { activeField } from '../lib/derive';

export default function IntercropScreen() {
  const { p } = useTheme();
  const { s, passportAdd, audit } = useApp();
  const f = activeField(s);
  const [crop, setCrop] = React.useState<CropKey>(f.crop);
  const [area, setArea] = React.useState(f.areaHa);
  const [ratio, setRatio] = React.useState(25);

  const options = COMPANIONS.filter((c) => c.a === crop);
  const [pick, setPick] = React.useState(0);
  const chosen = options[Math.min(pick, Math.max(0, options.length - 1))];

  const mainPrice = priceRange({ crop, qualityScore: 74, grade: 'B', quantityQuintal: 1 }).mid;
  const soleYield = 18; // q/ha reference for the main crop
  const mainShare = 1 - ratio / 100;
  const mainYield = soleYield * mainShare * 1.06; // border-row compensation
  const companionValue = chosen ? (chosen.ler - 1 + (1 - mainShare) * 0.35) * soleYield * mainPrice * 0.55 : 0;
  const soleRevenue = soleYield * mainPrice * area;
  const interRevenue = (mainYield * mainPrice + companionValue) * area;
  const delta = interRevenue - soleRevenue;

  return (
    <Screen>
      <ScreenHeader title="Intercropping planner" sub="Land-equivalent ratio, not folklore" icon="git-merge" right={<Pill text={`${options.length} PAIRS`} color={p.accent} />} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.md }}>
        {Array.from(new Set(COMPANIONS.map((c) => c.a))).map((c) => (
          <Chip key={c} label={`${CROPS[c].emoji} ${CROPS[c].name}`} active={crop === c} onPress={() => { setCrop(c); setPick(0); }} />
        ))}
      </ScrollView>

      {options.length === 0 ? (
        <Banner kind="warn" text="No validated companion pairs for this crop in the offline knowledge base yet." />
      ) : (
        <>
          <Card pad={space.md}>
            <FieldPattern ratio={ratio} />
            <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
              <T variant="micro" color={p.textDim}>{CROPS[crop].name.toUpperCase()} {100 - ratio}% · {chosen.b.toUpperCase()} {ratio}%</T>
              <T variant="micro" color={p.textFaint}>{chosen.spacing}</T>
            </Row>
          </Card>

          <Card>
            <Slider label="Companion share of the field" value={ratio} min={5} max={50} step={5} unit="%" onChange={setRatio} color={p.accent} />
            <Slider label="Field area" value={area} min={0.2} max={8} step={0.1} unit=" ha" onChange={setArea} />
          </Card>

          <Row gap={space.sm} style={{ marginBottom: space.md }}>
            <Stat label="LER" value={`${chosen.ler}`} sub="land equivalent ratio" color={p.primary} icon="resize" />
            <Stat label="Revenue change" value={`${delta >= 0 ? '+' : '−'}${inr(Math.abs(delta))}`} sub={`on ${area} ha`} color={delta >= 0 ? p.ok : p.danger} icon="trending-up" />
            <Stat label="Risk spread" value={`${Math.round(ratio)}%`} sub="income diversified" color={p.sun} icon="shield" />
          </Row>

          {options.map((o, i) => (
            <Card key={o.b} glow={i === pick} onPress={() => setPick(i)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Row gap={6}>
                    <T variant="h3">{CROPS[o.a].name} + {o.b}</T>
                    {i === pick ? <Pill text="SELECTED" color={p.primary} /> : null}
                  </Row>
                  <T variant="micro" color={p.textDim}>{o.spacing}</T>
                </View>
                <T variant="h2" color={o.ler > 1.25 ? p.ok : p.text}>{o.ler}</T>
              </Row>
              <Bar value={(o.ler - 1) / 0.5} color={o.ler > 1.25 ? p.ok : p.accent} height={6} />
              <T variant="small" color={p.textDim} style={{ marginTop: 8 }}>{o.why}</T>
            </Card>
          ))}

          <Card>
            <SectionTitle title="Why LER matters" icon="information-circle" />
            <T variant="small" color={p.textDim}>
              An LER of {chosen.ler} means you would need {chosen.ler} hectares of sole crops to match what one intercropped hectare produces. Anything above 1.0 is real biological efficiency — light, water and nutrients captured by two canopies with different architecture and rooting depth.
            </T>
            <Divider />
            <KV k="Sole crop revenue" v={inr(soleRevenue)} />
            <KV k="Intercrop revenue" v={inr(interRevenue)} color={delta >= 0 ? p.ok : p.danger} />
            <KV k="Extra labour" v={`≈ ${(ratio * 0.35).toFixed(0)} person-days/ha at sowing and harvest`} />
            <KV k="Pest benefit" v="Companion strips host predators and break pest search patterns" />
            <Btn
              title="Add plan to Farm Passport"
              icon="qr-code"
              style={{ marginTop: space.sm }}
              onPress={() => {
                passportAdd({ event: 'field_operation', op: 'Intercrop plan', main: crop, companion: chosen.b, ratio: `${ratio}%`, ler: chosen.ler });
                audit({ actor: s.profile.id, action: 'passport:append', resource: `field:${f.id}`, outcome: 'allow' });
              }}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

function FieldPattern({ ratio }: { ratio: number }) {
  const { p } = useTheme();
  const [w, setW] = React.useState(300);
  const rows = 12;
  const h = 150;
  const companionEvery = Math.max(2, Math.round(100 / ratio));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={h}>
        <G>
          {Array.from({ length: rows }).map((_, i) => {
            const isComp = i % companionEvery === companionEvery - 1;
            return <Rect key={i} x={(i * w) / rows + 1} y={0} width={w / rows - 2} height={h} rx={3} fill={isComp ? p.accent : p.primary} opacity={isComp ? 0.85 : 0.42} />;
          })}
        </G>
      </Svg>
    </View>
  );
}
