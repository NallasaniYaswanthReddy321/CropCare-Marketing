import React from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Banner, Btn, Card, Chip, Divider, Field, HeroImage, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, T } from '../components/ui';
import { HERO, avatarFor } from '../lib/images';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { LANGS } from '../lib/i18n';
import { speak } from '../lib/voice';
import { chainVerify } from '../lib/crypto';

export default function SettingsScreen({ navigation }: any) {
  const { p, toggle, scheme } = useTheme();
  const { s, set, reset, audit } = useApp();
  const [endpoint, setEndpoint] = React.useState(s.settings.ollamaEndpoint);
  const [model, setModel] = React.useState(s.settings.ollamaModel);
  const [exported, setExported] = React.useState<string | null>(null);

  const flag = (key: keyof typeof s.settings, label: string, sub: string, icon: string) => (
    <Row key={key as string} style={{ justifyContent: 'space-between', paddingVertical: 9 }}>
      <Row gap={10} style={{ flex: 1 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon as any} size={16} color={p.textDim} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="small">{label}</T>
          <T variant="micro" color={p.textFaint}>{sub}</T>
        </View>
      </Row>
      <Chip
        label={s.settings[key] ? 'On' : 'Off'}
        active={!!s.settings[key]}
        onPress={() => {
          set((d) => ({ ...d, settings: { ...d.settings, [key]: !d.settings[key as keyof typeof d.settings] } }));
          audit({ actor: s.profile.id, action: 'settings:update', resource: key as string, outcome: 'allow' });
        }}
      />
    </Row>
  );

  return (
    <Screen>
      <Row gap={12} style={{ marginBottom: space.lg }}>
        <Image source={avatarFor(s.profile.name)} style={{ width: 62, height: 62, borderRadius: 31 }} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <T variant="h1">{s.profile.name}</T>
          <T variant="small" color={p.textDim}>{s.profile.village} · member since {new Date(s.profile.joinedAt).getFullYear()}</T>
        </View>
        <Pill text={`KYC L${s.profile.kycLevel}`} color={p.ok} />
      </Row>

      <SectionTitle title="How the app looks" icon="color-palette" />
      <Card>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 9 }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="happy" size={16} color={p.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="small">Simple words</T>
              <T variant="micro" color={p.textFaint}>Short everyday language and bigger picture buttons. Turn off to see technical names.</T>
            </View>
          </Row>
          <Chip label={s.settings.simple ? 'On' : 'Off'} active={s.settings.simple} onPress={() => set((d) => ({ ...d, settings: { ...d.settings, simple: !d.settings.simple } }))} />
        </Row>
        <Divider />
        <T variant="small" color={p.textDim} style={{ marginBottom: space.sm }}>Your home tools ({s.settings.pinned.length} pinned)</T>
        <Btn small kind="soft" icon="apps" title="Choose home tools" onPress={() => navigation.navigate('Tabs', { screen: 'Hub' })} />
        <Btn small kind="ghost" icon="refresh" title="Show the welcome guide again" style={{ marginTop: space.sm }} onPress={() => set((d) => ({ ...d, settings: { ...d.settings, onboarded: false } }))} />
      </Card>

      <SectionTitle title="Language" icon="language" />
      <Card pad={space.md}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {LANGS.map((l) => (
            <Chip
              key={l.code}
              label={`${l.native}`}
              active={s.profile.lang === l.code}
              onPress={() => { set((d) => ({ ...d, profile: { ...d.profile, lang: l.code } })); speak(l.native, l.voice); }}
            />
          ))}
        </ScrollView>
        <T variant="micro" color={p.textFaint} style={{ marginTop: 8 }}>Interface, advisor and voice output all switch together. Missing strings fall back to English rather than showing blanks.</T>
      </Card>

      <SectionTitle title="Accessibility" icon="accessibility" />
      <Card>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 9 }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ear" size={16} color={p.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="small">Elder voice mode</T>
              <T variant="micro" color={p.textFaint}>Larger type, higher contrast, every screen readable aloud, slower speech</T>
            </View>
          </Row>
          <Chip label={s.settings.elder ? 'On' : 'Off'} active={s.settings.elder} onPress={() => set((d) => ({ ...d, settings: { ...d.settings, elder: !d.settings.elder } }))} />
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 9 }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={scheme === 'dark' ? 'moon' : 'sunny'} size={16} color={p.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="small">Theme</T>
              <T variant="micro" color={p.textFaint}>Night-farm dark is easier on the eyes at 5 a.m.; light mode survives direct sun</T>
            </View>
          </Row>
          <Chip label={scheme === 'dark' ? 'Dark' : 'Light'} active onPress={toggle} />
        </Row>
        {flag('voice', 'Speak answers aloud', 'Piper / system TTS reads advisor replies', 'volume-high')}
      </Card>

      <SectionTitle title="Connectivity & AI" icon="hardware-chip" />
      <Card>
        {flag('airplane', 'Airplane mode (offline test)', 'Blocks every network call — the app must stay fully usable', 'airplane')}
        <Divider />
        <T variant="micro" color={p.textDim}>OLLAMA ENDPOINT</T>
        <Field value={endpoint} onChangeText={setEndpoint} placeholder="http://localhost:11434" icon="server" onSubmit={() => set((d) => ({ ...d, settings: { ...d.settings, ollamaEndpoint: endpoint } }))} />
        <View style={{ height: space.sm }} />
        <T variant="micro" color={p.textDim}>MODEL</T>
        <Field value={model} onChangeText={setModel} placeholder="llama3.2:3b" icon="cube" onSubmit={() => set((d) => ({ ...d, settings: { ...d.settings, ollamaModel: model } }))} />
        <Row gap={8} wrap style={{ marginTop: space.sm }}>
          {['llama3.2:3b', 'gemma2:2b', 'qwen2.5:3b', 'phi3.5:mini'].map((m) => <Chip key={m} label={m} active={model === m} onPress={() => { setModel(m); set((d) => ({ ...d, settings: { ...d.settings, ollamaModel: m } })); }} />)}
        </Row>
        <Btn small title="Save AI settings" icon="save" style={{ marginTop: space.sm }} onPress={() => set((d) => ({ ...d, settings: { ...d.settings, ollamaEndpoint: endpoint, ollamaModel: model } }))} />
      </Card>

      <SectionTitle title="Security & privacy" icon="shield-checkmark" />
      <Card>
        {flag('sqlcipher', 'Encrypted local database', 'SQLCipher AES-256 page encryption, key in the device keystore', 'lock-closed')}
        {flag('mfaEnabled', 'Multi-factor authentication', 'TOTP required for financial actions', 'keypad')}
        {flag('biometric', 'Biometric unlock', 'Fingerprint / face unlock for the app and the wallet', 'finger-print')}
        {flag('telemetry', 'Share anonymous usage data', 'Off by default. No images, no locations, ever.', 'analytics')}
        {flag('robotics', 'Robotics bus', 'Allow MQTT actuator commands from this device', 'hardware-chip')}
        <Divider />
        <KV k="Audit chain" v={chainVerify(s.audit).ok ? `${s.audit.length} blocks, intact` : 'broken'} color={chainVerify(s.audit).ok ? p.ok : p.danger} />
        <Btn small kind="ghost" title="Open security centre" icon="shield" style={{ marginTop: space.sm }} onPress={() => navigation.navigate('Security')} />
      </Card>

      <SectionTitle title="Your data" icon="folder" />
      <Card>
        <KV k="Scans stored" v={`${s.scans.length}`} />
        <KV k="Passport events" v={`${s.passport.length}`} />
        <KV k="Ledger entries" v={`${s.ledger.length}`} />
        <KV k="Outbox" v={`${s.outbox.length} operations`} />
        <Row gap={space.sm} style={{ marginTop: space.sm }} wrap>
          <Btn
            small
            kind="soft"
            icon="download"
            title="Export my data (JSON)"
            onPress={() => {
              const payload = { profile: s.profile, fields: s.fields, scans: s.scans.map(({ detail, ...r }) => r), passport: s.passport, ledger: s.ledger };
              setExported(JSON.stringify(payload).slice(0, 420) + '…');
              audit({ actor: s.profile.id, action: 'privacy:export', resource: 'account', outcome: 'allow' });
            }}
          />
          <Btn small kind="danger" icon="trash" title="Erase & reseed device" onPress={() => { reset(); setExported(null); }} />
        </Row>
        {exported ? <T variant="mono" color={p.textFaint} style={{ marginTop: space.sm }}>{exported}</T> : null}
        <Banner kind="info" icon="lock-closed" text="Export is generated on the device. Erasure destroys per-record data keys (crypto-shredding), so any copy already replicated to a peer becomes permanently unreadable." />
      </Card>

      <SectionTitle title="About" icon="information-circle" />
      <Card>
        <KV k="Build" v="CropCare 1.0.0 · Expo SDK 54 · React Native 0.81" />
        <KV k="Licence" v="AGPL-3.0 — 100% free and open source" />
        <KV k="Stack" v="Expo · Flask · SQLite/SQLCipher · scikit-learn · Ollama · Whisper.cpp · Piper · Mosquitto" />
        <KV k="Models" v="price_model.pkl (GBT) · on-device CV ensemble (7.4 MB INT8)" />
        <KV k="Honesty" v="Prices are estimated ranges. Photos never imply laboratory properties." color={p.warn} />
      </Card>
    </Screen>
  );
}
