import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnswerCard, Btn, Card, Chip, Divider, Field, KV, PicturePicker, Row, Screen, SectionTitle,
  Steps, Stepper, T,
} from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { CROPS, CropKey, SOILS, SoilKey } from '../lib/agro';
import { CROP_IMG } from '../lib/images';
import { uid } from '../lib/crypto';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';

const SOIL_HINT: Record<SoilKey, string> = {
  sandy: 'Water drains fast. Feels gritty, will not hold a ball.',
  loam: 'The easy soil. Holds a ball but crumbles when poked.',
  clay_loam: 'Sticky when wet, holds water well.',
  clay: 'Very sticky, cracks when dry, drains slowly.',
  black_cotton: 'Black, swells when wet, deep cracks in summer.',
};

const WATER_HINT = {
  drip: 'Pipes with small holes at each plant. Saves the most water.',
  sprinkler: 'Sprays like rain over the field.',
  furrow: 'Water runs down channels between rows.',
} as const;

export default function AddFieldScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, push, passportAdd, audit } = useApp();
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState('');
  const [crop, setCrop] = React.useState<CropKey>('tomato');
  const [variety, setVariety] = React.useState('');
  const [area, setArea] = React.useState(1);
  const [soil, setSoil] = React.useState<SoilKey>('loam');
  const [water, setWater] = React.useState<'drip' | 'sprinkler' | 'furrow'>('drip');
  const [weeks, setWeeks] = React.useState(4);
  const [done, setDone] = React.useState<string | null>(null);

  const say = (text: string) => speak(text, voiceLocale(s.profile.lang));

  const save = () => {
    const id = uid('fld');
    const sowDate = new Date(Date.now() - weeks * 7 * 86400000).toISOString().slice(0, 10);
    const base = s.fields[0];
    set((d) => ({
      ...d,
      fields: [
        ...d.fields,
        {
          id, name: name.trim() || `${CROPS[crop].name} field ${d.fields.length + 1}`,
          crop, areaHa: area, soil, sowDate,
          lat: base ? base.lat + (Math.random() - 0.5) * 0.01 : 18.52,
          lon: base ? base.lon + (Math.random() - 0.5) * 0.01 : 73.86,
          ndvi: [0.16, 0.22, 0.3, 0.38, 0.45, 0.52, 0.58, 0.62, 0.64, 0.63],
          depletionMm: 12,
          variety: variety.trim() || 'Local variety',
          irrigationType: water,
        },
      ],
      activeFieldId: id,
    }));
    push('field_create', { id, crop, areaHa: area, soil });
    passportAdd({ event: 'field_registered', field: name.trim() || CROPS[crop].name, crop, area });
    audit({ actor: s.profile.id, action: 'field:create', resource: `field:${id}`, outcome: 'allow', meta: { crop, area } });
    setDone(id);
    say(`Field saved. ${CROPS[crop].name}, ${area} hectare. I will now tell you when to water it.`);
  };

  if (done) {
    return (
      <Screen>
        <AnswerCard
          tone="ok"
          headline="Your field is saved"
          detail={`${CROPS[crop].name} on ${area} ha. From now on this field gets its own water plan, price advice and disease warnings. Nothing was sent anywhere — it is stored on your phone.`}
          image={CROP_IMG[crop]}
          onSpeak={() => say('Your field is saved. It now has its own water plan and price advice.')}
          action={
            <Row gap={space.sm}>
              <Btn title="See water plan" icon="water" style={{ flex: 1 }} onPress={() => navigation.replace('Irrigation')} />
              <Btn title="Go home" kind="ghost" icon="home" style={{ flex: 1 }} onPress={() => navigation.navigate('Tabs')} />
            </Row>
          }
        />
        <Card>
          <SectionTitle title="What you told me" icon="list" />
          <KV k="Crop" v={CROPS[crop].name} />
          <KV k="Variety" v={variety.trim() || 'Local variety'} />
          <KV k="Area" v={`${area} ha`} />
          <KV k="Soil" v={SOILS[soil].name} />
          <KV k="Watering" v={water} />
          <KV k="Planted" v={`${weeks} weeks ago`} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Steps items={['Crop', 'Size & soil', 'Water', 'Check']} active={step} />

      {step === 0 ? (
        <>
          <Card>
            <T variant="h2">What are you growing?</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.md }}>Tap the picture of your crop.</T>
            <PicturePicker
              value={crop}
              onChange={(k) => { setCrop(k as CropKey); say(CROPS[k as CropKey].name); }}
              items={Object.values(CROPS).map((c) => ({ key: c.key, label: c.name, image: CROP_IMG[c.key], sub: `${c.stages.ini + c.stages.dev + c.stages.mid + c.stages.late} days` }))}
            />
            <Divider />
            <T variant="small" color={p.textDim}>Give the field a name (optional)</T>
            <View style={{ height: 6 }} />
            <Field value={name} onChangeText={setName} placeholder="e.g. Canal field" icon="map" />
            <View style={{ height: space.sm }} />
            <T variant="small" color={p.textDim}>Seed variety (optional)</T>
            <View style={{ height: 6 }} />
            <Field value={variety} onChangeText={setVariety} placeholder="e.g. Arka Rakshak" icon="flower" />
          </Card>
          <Btn title="Next" icon="arrow-forward" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Card>
            <T variant="h2">How big is the field?</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.md }}>Use the buttons. 1 hectare is about 2.5 acres.</T>
            <Stepper label="Area" value={area} min={0.1} max={40} step={0.1} unit="ha" onChange={setArea} />
            <T variant="micro" color={p.textFaint} style={{ textAlign: 'center' }}>{(area * 2.471).toFixed(2)} acres · {(area * 10000).toLocaleString('en-IN')} m²</T>
            <Divider />
            <T variant="h3">What is the soil like?</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.sm }}>Squeeze a wet handful and pick what matches.</T>
            {(Object.keys(SOILS) as SoilKey[]).map((k) => (
              <Card
                key={k}
                pad={space.md}
                glow={soil === k}
                onPress={() => { setSoil(k); say(SOIL_HINT[k]); }}
                style={{ marginBottom: space.sm }}
              >
                <Row gap={10}>
                  <Ionicons name={soil === k ? 'radio-button-on' : 'radio-button-off'} size={22} color={soil === k ? p.primary : p.textFaint} />
                  <View style={{ flex: 1 }}>
                    <T variant="h3">{SOILS[k].name}</T>
                    <T variant="small" color={p.textDim}>{SOIL_HINT[k]}</T>
                  </View>
                </Row>
              </Card>
            ))}
          </Card>
          <Row gap={space.sm}>
            <Btn title="Back" kind="ghost" icon="arrow-back" style={{ flex: 1 }} onPress={() => setStep(0)} />
            <Btn title="Next" icon="arrow-forward" style={{ flex: 1.4 }} onPress={() => setStep(2)} />
          </Row>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Card>
            <T variant="h2">How do you water it?</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.sm }}>This changes how much water I tell you to give.</T>
            {(['drip', 'sprinkler', 'furrow'] as const).map((k) => (
              <Card key={k} pad={space.md} glow={water === k} onPress={() => { setWater(k); say(WATER_HINT[k]); }} style={{ marginBottom: space.sm }}>
                <Row gap={10}>
                  <Ionicons name={water === k ? 'radio-button-on' : 'radio-button-off'} size={22} color={water === k ? p.primary : p.textFaint} />
                  <View style={{ flex: 1 }}>
                    <T variant="h3" style={{ textTransform: 'capitalize' }}>{k}</T>
                    <T variant="small" color={p.textDim}>{WATER_HINT[k]}</T>
                  </View>
                </Row>
              </Card>
            ))}
            <Divider />
            <T variant="h3">When did you plant it?</T>
            <Stepper label="Weeks ago" value={weeks} min={0} max={40} step={1} unit="weeks" onChange={setWeeks} />
          </Card>
          <Row gap={space.sm}>
            <Btn title="Back" kind="ghost" icon="arrow-back" style={{ flex: 1 }} onPress={() => setStep(1)} />
            <Btn title="Next" icon="arrow-forward" style={{ flex: 1.4 }} onPress={() => setStep(3)} />
          </Row>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <AnswerCard
            tone="info"
            headline="Is this right?"
            detail={`${CROPS[crop].name} on ${area} ha of ${SOILS[soil].name.toLowerCase()} soil, watered by ${water}, planted ${weeks} weeks ago.`}
            image={CROP_IMG[crop]}
            onSpeak={() => say(`${CROPS[crop].name} on ${area} hectare of ${SOILS[soil].name} soil, watered by ${water}, planted ${weeks} weeks ago.`)}
          />
          <Card>
            <SectionTitle title="What you will get" icon="gift" />
            {[
              'A daily answer: water today, or wait.',
              'A price range for your crop and the best market after transport.',
              'Disease warnings from farms near you.',
              'A QR crop passport buyers can check.',
            ].map((x) => (
              <Row key={x} gap={9} style={{ paddingVertical: 6, alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle" size={16} color={p.ok} style={{ marginTop: 2 }} />
                <T variant="small" style={{ flex: 1 }}>{x}</T>
              </Row>
            ))}
          </Card>
          <Row gap={space.sm} style={{ marginBottom: space.xl }}>
            <Btn title="Back" kind="ghost" icon="arrow-back" style={{ flex: 1 }} onPress={() => setStep(2)} />
            <Btn title="Save my field" icon="checkmark-circle" style={{ flex: 1.6 }} onPress={save} />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}
