import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnswerCard, Banner, Bar, Btn, Card, Chip, Divider, Gauge, KV, MultiLine, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, Stat, T } from '../components/ui';
import { TILE } from '../lib/images';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField, EFFICIENCY, fieldWeather, daysAfterSowing } from '../lib/derive';
import { CROPS, SOILS, et0Hargreaves, et0PenmanMonteith, irrigationAdvice } from '../lib/agro';

export default function IrrigationScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, push, passportAdd, audit } = useApp();
  const f = activeField(s);
  const [depletion, setDepletion] = React.useState(f.depletionMm);
  const [system, setSystem] = React.useState(f.irrigationType);

  const weather = React.useMemo(() => fieldWeather(f, 10), [f.id]);
  const das = daysAfterSowing(f);
  const res = React.useMemo(
    () => irrigationAdvice({
      crop: CROPS[f.crop], soil: f.soil, das, weather, elevationM: 560, latitude: f.lat,
      currentDepletionMm: depletion, efficiency: EFFICIENCY[system], systemLph: system === 'drip' ? 12000 : 26000, areaHa: f.areaHa,
    }),
    [f.id, depletion, system, das],
  );

  const doy = Math.floor((Date.now() - +new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const pm = et0PenmanMonteith(weather[0], 560, f.lat, doy);
  const hs = et0Hargreaves(weather[0], f.lat, doy);

  const forecast = weather.map((w, i) => {
    const r = irrigationAdvice({
      crop: CROPS[f.crop], soil: f.soil, das: das + i, weather: weather.slice(i).concat(weather.slice(0, i)),
      elevationM: 560, latitude: f.lat, currentDepletionMm: depletion + i * 2, efficiency: EFFICIENCY[system],
      systemLph: 12000, areaHa: f.areaHa,
    });
    return r;
  });

  const apply = () => {
    set((d) => ({
      ...d,
      fields: d.fields.map((x) => (x.id === f.id ? { ...x, depletionMm: 2, lastIrrigation: new Date().toISOString(), irrigationType: system } : x)),
    }));
    push('irrigation_event', { field: f.id, mm: res.grossDepthMm, hours: res.hoursToRun });
    passportAdd({ event: 'irrigation', mm: res.grossDepthMm, method: system, litres: res.litresPerHa * f.areaHa });
    audit({ actor: s.profile.id, action: 'irrigation:apply', resource: `field:${f.id}`, outcome: 'allow', meta: { mm: res.grossDepthMm } });
    setDepletion(2);
  };

  return (
    <Screen>
      <ScreenHeader
        title={s.settings.simple ? 'Water today?' : 'Irrigation'}
        sub={`${f.name} · ${CROPS[f.crop].name} · ${SOILS[f.soil].name}`}
        icon="water"
        right={<Pill text="FAO-56" color={p.water} />}
      />

      <AnswerCard
        tone={res.irrigateNow ? 'warn' : 'ok'}
        headline={res.irrigateNow ? `Yes — give ${res.grossDepthMm} mm today` : 'No water needed today'}
        detail={res.irrigateNow
          ? `About ${(res.litresPerHa * f.areaHa / 1000).toFixed(0)} thousand litres for ${f.areaHa} ha — roughly ${res.hoursToRun} hours on your ${system}. Do it in the cool hours.`
          : `The soil still holds enough water. Check again in ${res.nextCheckDays} day${res.nextCheckDays > 1 ? 's' : ''}.`}
        image={TILE.water}
        onSpeak={() => speak(
          res.irrigateNow
            ? `Give water today. About ${res.grossDepthMm} millimetres, roughly ${res.hoursToRun} hours of running time.`
            : `No water needed today. Check again in ${res.nextCheckDays} days.`,
          voiceLocale(s.profile.lang),
        )}
        action={res.irrigateNow ? <Btn title="I watered it" icon="checkmark-done" onPress={apply} /> : undefined}
      />

      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="h2" color={res.irrigateNow ? p.water : p.ok}>{res.irrigateNow ? `Apply ${res.grossDepthMm} mm today` : 'Hold irrigation'}</T>
            <T variant="small" color={p.textDim} style={{ marginTop: 4 }}>{res.reason}</T>
            {res.irrigateNow ? (
              <Row gap={6} wrap style={{ marginTop: 8 }}>
                <Pill text={`${(res.litresPerHa * f.areaHa / 1000).toFixed(1)} kL total`} color={p.water} icon="water" />
                <Pill text={`${res.hoursToRun} h run time`} color={p.accent} icon="time" />
                <Pill text={`net ${res.netDepthMm} mm`} color={p.textDim} />
              </Row>
            ) : (
              <Pill text={`Re-check in ${res.nextCheckDays} day(s)`} color={p.ok} icon="calendar" />
            )}
          </View>
          <Gauge value={res.depletionPct} label="DEPLETED" color={res.depletionPct > 65 ? p.warn : p.water} size={118} />
        </Row>
        {res.irrigateNow ? <Btn title="Log irrigation to passport" icon="checkmark-done" onPress={apply} style={{ marginTop: space.md }} /> : null}
      </Card>

      <SectionTitle title="Soil water balance" icon="beaker" />
      <Card>
        <Bar value={res.depletion} max={res.taw} color={res.depletion > res.raw ? p.warn : p.water} height={14} />
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <T variant="micro" color={p.textFaint}>0 mm (field capacity)</T>
          <T variant="micro" color={p.warn}>RAW {res.raw} mm</T>
          <T variant="micro" color={p.textFaint}>TAW {res.taw} mm</T>
        </Row>
        <Divider />
        <Slider label="Measured / estimated depletion" value={depletion} min={0} max={res.taw} step={1} unit=" mm" onChange={setDepletion} color={p.water} />
        <Row gap={8} wrap>
          {(['drip', 'sprinkler', 'furrow'] as const).map((sys) => (
            <Chip key={sys} label={`${sys} · η ${EFFICIENCY[sys]}`} active={system === sys} onPress={() => setSystem(sys)} color={p.water} />
          ))}
        </Row>
      </Card>

      <SectionTitle title="Reference evapotranspiration" icon="sunny" />
      <Card>
        <Row gap={space.sm} style={{ marginBottom: space.md }}>
          <Stat label="ET₀ Penman-Monteith" value={`${pm.toFixed(2)}`} sub="mm/day (primary)" color={p.sun} icon="sunny" />
          <Stat label="ET₀ Hargreaves" value={`${hs.toFixed(2)}`} sub="mm/day (fallback)" color={p.textDim} icon="thermometer" />
          <Stat label="Crop ETc" value={`${res.etc}`} sub={`Kc ${res.kc} · ${res.stage}`} color={p.primary} icon="leaf" />
        </Row>
        <MultiLine
          height={130}
          series={[
            { data: forecast.map((x) => x.et0), color: p.sun, name: 'ET₀ mm' },
            { data: forecast.map((x) => x.etc), color: p.primary, name: 'ETc mm' },
            { data: weather.map((w) => w.rainMm), color: p.water, name: 'Rain mm' },
          ]}
          labels={['today', '+3d', '+6d', '+9d']}
        />
        <Divider />
        <KV k="Method" v="FAO-56 eq. 6, grass reference, 2 m wind, albedo 0.23" />
        <KV k="Radiation" v={`${weather[0].radMJ} MJ/m²/day, RH ${weather[0].rhMean}%`} />
        <KV k="Effective rainfall" v={`${Math.max(0, weather[0].rainMm * 0.8 - 2).toFixed(1)} mm of ${weather[0].rainMm} mm`} />
        <KV k="Water stress coefficient Ks" v={res.stress > 0 ? `${(1 - res.stress).toFixed(2)} — yield at risk` : '1.00 — no stress'} color={res.stress > 0 ? p.warn : p.ok} />
      </Card>

      <SectionTitle title="7-day irrigation plan" icon="calendar" />
      <Card>
        {forecast.slice(0, 7).map((r, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
            <Row gap={8}>
              <Ionicons name={r.irrigateNow ? 'water' : 'remove-circle-outline'} size={15} color={r.irrigateNow ? p.water : p.textFaint} />
              <T variant="small">{i === 0 ? 'Today' : new Date(weather[i].date).toLocaleDateString('en-IN', { weekday: 'long' })}</T>
            </Row>
            <T variant="small" color={r.irrigateNow ? p.water : p.textDim}>{r.irrigateNow ? `${r.grossDepthMm} mm · ${r.hoursToRun} h` : `hold · ${r.depletionPct}% depleted`}</T>
          </Row>
        ))}
        <Banner kind="info" icon="bulb" text={`On ${SOILS[f.soil].name.toLowerCase()} soil with ${system}, splitting doses above ${Math.round(res.raw * 0.9)} mm into two runs prevents percolation below the root zone.`} />
      </Card>

      <Btn title="Open digital twin" icon="cube" kind="ghost" onPress={() => navigation.navigate('Twin')} style={{ marginBottom: space.xl }} />
    </Screen>
  );
}
