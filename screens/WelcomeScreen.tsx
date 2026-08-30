import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Divider, Field, Row, Screen, Steps, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { LANGS, voiceLocale } from '../lib/i18n';
import { CROPS, CropKey } from '../lib/agro';
import { CROP_IMG, HERO, avatarFor } from '../lib/images';
import { speak } from '../lib/voice';

/**
 * First-run flow. Three questions, pictures instead of jargon, every screen
 * readable aloud. Nothing leaves the phone; no account, no OTP, no signup.
 */
export default function WelcomeScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set } = useApp();
  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState(s.profile.name);
  const [village, setVillage] = React.useState(s.profile.village);
  const [crop, setCrop] = React.useState<CropKey>('tomato');
  const [big, setBig] = React.useState(false);

  const finish = () => {
    set((d) => ({
      ...d,
      profile: { ...d.profile, name: name.trim() || d.profile.name, village: village.trim() || d.profile.village },
      fields: d.fields.map((f, i) => (i === 0 ? { ...f, crop } : f)),
      settings: { ...d.settings, onboarded: true, elder: big },
    }));
  };

  return (
    <Screen>
      <Steps items={['Language', 'You', 'Crop']} active={step} />

      {step === 0 ? (
        <>
          <View style={{ borderRadius: radius.xl, overflow: 'hidden', marginBottom: space.lg }}>
            <Image source={HERO.splash} style={{ width: '100%', height: 210 }} contentFit="cover" />
          </View>
          <T variant="h1" center>Welcome to CropCare</T>
          <T variant="body" color={p.textDim} center style={{ marginBottom: space.lg, paddingHorizontal: space.md, lineHeight: 22 }}>
            Your farm helper. It works without internet. Choose the language you speak.
          </T>
          <Row gap={space.sm} wrap style={{ justifyContent: 'center' }}>
            {LANGS.map((l) => {
              const on = s.profile.lang === l.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => {
                    set((d) => ({ ...d, profile: { ...d.profile, lang: l.code } }));
                    speak(l.native, voiceLocale(l.code));
                  }}
                  accessibilityLabel={l.name}
                  style={{
                    width: '30%', paddingVertical: space.lg, borderRadius: radius.lg, alignItems: 'center', gap: 4,
                    backgroundColor: on ? p.primary + '1E' : p.card,
                    borderWidth: on ? 2.5 : 1, borderColor: on ? p.primary : p.glassBorder, marginBottom: space.sm,
                  }}
                >
                  <T variant="h3" color={on ? p.primary : p.text}>{l.native}</T>
                  <T variant="micro" color={p.textFaint}>{l.name}</T>
                </Pressable>
              );
            })}
          </Row>
          <Btn title="Next" icon="arrow-forward" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Card>
            <Row gap={12} style={{ marginBottom: space.md }}>
              <Image source={avatarFor(name || 'farmer')} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <T variant="h2">What is your name?</T>
                <T variant="small" color={p.textDim}>Only stored on this phone.</T>
              </View>
            </Row>
            <Field value={name} onChangeText={setName} placeholder="Your name" icon="person" />
            <View style={{ height: space.md }} />
            <T variant="small" color={p.textDim}>Your village</T>
            <View style={{ height: 6 }} />
            <Field value={village} onChangeText={setVillage} placeholder="Village name" icon="location" />
            <Divider />
            <Pressable
              onPress={() => setBig((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: big ? p.primary : p.glassBorder, backgroundColor: big ? p.primary + '12' : 'transparent' }}
            >
              <Ionicons name={big ? 'checkbox' : 'square-outline'} size={26} color={big ? p.primary : p.textFaint} />
              <View style={{ flex: 1 }}>
                <T variant="h3">Bigger text and voice</T>
                <T variant="small" color={p.textDim}>Larger letters, bigger buttons, everything can be read aloud.</T>
              </View>
            </Pressable>
          </Card>
          <Row gap={space.sm}>
            <Btn title="Back" kind="ghost" icon="arrow-back" style={{ flex: 1 }} onPress={() => setStep(0)} />
            <Btn title="Next" icon="arrow-forward" style={{ flex: 1.5 }} onPress={() => setStep(2)} />
          </Row>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Card>
            <T variant="h2">What do you grow most?</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.md }}>Tap a picture. You can add more fields later.</T>
            <Row gap={space.sm} wrap>
              {Object.values(CROPS).map((c) => {
                const on = crop === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => { setCrop(c.key); speak(c.name, voiceLocale(s.profile.lang)); }}
                    style={{ width: '31.5%', borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm, borderWidth: on ? 2.5 : 1, borderColor: on ? p.primary : p.glassBorder, backgroundColor: p.card }}
                  >
                    <Image source={CROP_IMG[c.key]} style={{ width: '100%', height: 64 }} contentFit="cover" />
                    <T variant="small" center color={on ? p.primary : p.text} style={{ paddingVertical: 7 }}>{c.name}</T>
                  </Pressable>
                );
              })}
            </Row>
          </Card>
          <Card>
            <T variant="h3">Three promises</T>
            {[
              ['wifi-outline', 'Works with no signal. Everything is calculated on your phone.'],
              ['lock-closed-outline', 'Your photos and data never leave this phone unless you choose to share.'],
              ['pricetag-outline', 'Prices are honest estimates with a range — never a fixed promise.'],
            ].map(([icon, text]) => (
              <Row key={text} gap={10} style={{ paddingVertical: 7, alignItems: 'flex-start' }}>
                <Ionicons name={icon as any} size={18} color={p.primary} style={{ marginTop: 2 }} />
                <T variant="small" color={p.textDim} style={{ flex: 1 }}>{text}</T>
              </Row>
            ))}
          </Card>
          <Row gap={space.sm} style={{ marginBottom: space.xl }}>
            <Btn title="Back" kind="ghost" icon="arrow-back" style={{ flex: 1 }} onPress={() => setStep(1)} />
            <Btn title="Start" icon="checkmark-circle" style={{ flex: 1.6 }} onPress={finish} />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}
