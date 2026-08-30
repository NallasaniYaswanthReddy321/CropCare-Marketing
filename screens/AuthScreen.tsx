import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AnswerCard, Banner, Btn, Card, Divider, Field, KV, Pill, Row, Screen, SectionTitle, Steps, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { LANGS, makeT, voiceLocale } from '../lib/i18n';
import { CROP_IMG, HERO, avatarFor } from '../lib/images';
import { speak } from '../lib/voice';
import { CROPS, CropKey } from '../lib/agro';
import {
  Challenge, canResend, issueChallenge, maskDestination, parseDestination, resendIn, verifyChallenge,
} from '../lib/auth';
import { Place, getFix, nearestPlace, searchPlaces } from '../lib/geo';

const STEP_LABELS = ['Language', 'Sign in', 'Code', 'You', 'Place'];

export default function AuthScreen() {
  const { p } = useTheme();
  const { s, set, audit } = useApp();
  const t = makeT(s.profile.lang);

  const [step, setStep] = React.useState(0);
  const [raw, setRaw] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [ch, setCh] = React.useState<Challenge | null>(null);
  const [code, setCode] = React.useState('');
  const [tick, setTick] = React.useState(0);

  const [name, setName] = React.useState('');
  const [crop, setCrop] = React.useState<CropKey>('tomato');
  const [query, setQuery] = React.useState('');
  const [place, setPlace] = React.useState<Place | null>(null);
  const [gps, setGps] = React.useState<{ lat: number; lon: number; acc: number | null; km: number } | null>(null);
  const [geoMsg, setGeoMsg] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const results = React.useMemo(() => searchPlaces(query, 10), [query]);

  /* ------------------------------- step 1 -------------------------------- */
  const sendCode = async () => {
    setErr(null);
    const parsed = parseDestination(raw);
    if (!parsed.ok) { setErr(parsed.reason); return; }
    setBusy(true);
    try {
      const challenge = await issueChallenge(parsed.destination, s.settings.authGateway);
      setCh(challenge);
      setCode('');
      setStep(2);
      audit({ actor: 'anonymous', action: 'auth:otp_issue', resource: parsed.destination.kind, outcome: 'info', meta: { delivered: challenge.delivered } });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!ch || !canResend(ch)) return;
    setBusy(true);
    try {
      const next = await issueChallenge(ch.destination, s.settings.authGateway);
      setCh(next);
      setCode('');
      setErr(null);
    } finally { setBusy(false); }
  };

  const submitCode = () => {
    if (!ch) return;
    const res = verifyChallenge(ch, code);
    setCh(res.challenge);
    if (!res.ok) {
      setErr(res.reason);
      audit({ actor: maskDestination(ch.destination), action: 'auth:otp_verify', resource: 'session', outcome: 'deny', meta: { reason: res.reason } });
      if (res.locked) { setStep(1); setCh(null); }
      return;
    }
    setErr(null);
    set((d) => ({
      ...d,
      session: {
        signedIn: true, destination: ch.destination, verifiedAt: Date.now(), method: 'otp', deviceId: d.session.deviceId,
      },
      profile: { ...d.profile, phone: ch.destination.kind === 'phone' ? maskDestination(ch.destination) : d.profile.phone, kycLevel: 1 },
    }));
    audit({ actor: maskDestination(ch.destination), action: 'auth:otp_verify', resource: 'session', outcome: 'allow' });
    setStep(3);
  };

  /* ------------------------------- step 4 -------------------------------- */
  const useGps = async () => {
    setLocating(true);
    setGeoMsg(null);
    const r = await getFix();
    setLocating(false);
    if (!r.ok) { setGeoMsg(r.reason); return; }
    setGps({ lat: r.fix.lat, lon: r.fix.lon, acc: r.fix.accuracy, km: r.fix.km });
    setPlace(r.fix.place);
    setQuery(r.fix.place.d);
    setGeoMsg(`Found you ${r.fix.km} km from ${r.fix.place.d}, ${r.fix.place.s}${r.fix.accuracy ? ` (±${Math.round(r.fix.accuracy)} m)` : ''}.`);
  };

  const finish = () => {
    const chosen = place ?? nearestPlace(18.52, 73.86).place;
    set((d) => ({
      ...d,
      profile: {
        ...d.profile,
        name: name.trim() || 'Farmer',
        village: chosen.d,
        kycLevel: 2,
        joinedAt: Date.now(),
      },
      geo: {
        lat: gps?.lat ?? chosen.lat, lon: gps?.lon ?? chosen.lon,
        district: chosen.d, state: chosen.s, zone: chosen.z, soil: chosen.soil, rain: chosen.rain,
        source: gps ? 'gps' : 'manual', accuracy: gps?.acc ?? null, at: Date.now(),
      },
      fields: d.fields.map((f, i) =>
        i === 0
          ? { ...f, crop, lat: gps?.lat ?? chosen.lat, lon: gps?.lon ?? chosen.lon, name: `${chosen.d} plot` }
          : { ...f, lat: (gps?.lat ?? chosen.lat) + i * 0.004, lon: (gps?.lon ?? chosen.lon) + i * 0.004 },
      ),
      settings: { ...d.settings, onboarded: true },
    }));
    audit({ actor: s.profile.id, action: 'profile:create', resource: 'account', outcome: 'allow', meta: { district: chosen.d, source: gps ? 'gps' : 'manual' } });
  };

  /* --------------------------------- ui ---------------------------------- */
  return (
    <Screen>
      <Steps items={STEP_LABELS} active={step} />

      {/* ---------------------------- language ---------------------------- */}
      {step === 0 ? (
        <>
          <View style={{ borderRadius: radius.xl, overflow: 'hidden', marginBottom: space.lg }}>
            <Image source={HERO.splash} style={{ width: '100%', height: 190 }} contentFit="cover" />
          </View>
          <T variant="h1" center>CropCare</T>
          <T variant="body" color={p.textDim} center style={{ marginBottom: space.lg, paddingHorizontal: space.md, lineHeight: 22 }}>
            Choose your language. You can change it any time in Settings — the whole app, the voice and the advice all switch together.
          </T>
          <Row gap={space.sm} wrap style={{ justifyContent: 'center' }}>
            {LANGS.map((l) => {
              const on = s.profile.lang === l.code;
              return (
                <Pressable
                  key={l.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => { set((d) => ({ ...d, profile: { ...d.profile, lang: l.code } })); speak(l.native, voiceLocale(l.code)); }}
                  style={{
                    width: '30.5%', paddingVertical: space.lg, borderRadius: radius.lg, alignItems: 'center', gap: 4,
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
          <Btn title="Continue" icon="arrow-forward" onPress={() => setStep(1)} />
        </>
      ) : null}

      {/* ---------------------------- sign in ----------------------------- */}
      {step === 1 ? (
        <>
          <Card>
            <T variant="h2">Mobile number or e-mail</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.md }}>
              We send a 6-digit code to confirm it is you. Your number is stored on this phone only, and never shown to buyers.
            </T>
            <Field
              value={raw}
              onChangeText={(v) => { setRaw(v); setErr(null); }}
              placeholder="98765 43210  or  you@mail.com"
              icon="call"
              keyboardType="default"
              onSubmit={sendCode}
            />
            {err ? <Banner kind="danger" text={err} /> : null}
            <Btn title={busy ? 'Sending…' : 'Send me the code'} icon="send" loading={busy} onPress={sendCode} style={{ marginTop: space.md }} />
            <Divider />
            <Row gap={8} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="lock-closed" size={15} color={p.primary} style={{ marginTop: 2 }} />
              <T variant="micro" color={p.textFaint} style={{ flex: 1 }}>
                The code is generated with a secure random source and stored only as a salted hash. It expires in 5 minutes and locks after 5 wrong tries.
              </T>
            </Row>
          </Card>
          <Btn title="Back" kind="ghost" icon="arrow-back" onPress={() => setStep(0)} />
        </>
      ) : null}

      {/* ------------------------------ code ------------------------------ */}
      {step === 2 && ch ? (
        <>
          <AnswerCard
            tone={ch.delivered === 'gateway' ? 'ok' : 'info'}
            headline={ch.delivered === 'gateway' ? 'Code sent' : 'Your code is on this screen'}
            detail={ch.deliveryNote}
            image={HERO.help}
            onSpeak={() => speak(ch.deliveryNote, voiceLocale(s.profile.lang))}
          />

          {ch.localCode ? (
            <Card glow>
              <T variant="micro" color={p.textDim}>YOUR ONE-TIME CODE</T>
              <View accessibilityLabel={`one-time-code ${ch.localCode}`}>
                <Row gap={10} style={{ justifyContent: 'center', marginVertical: space.md }}>
                  {ch.localCode.split('').map((digit, i) => (
                    <View key={i} style={{ width: 44, height: 56, borderRadius: 14, backgroundColor: p.primary + '18', borderWidth: 1.5, borderColor: p.primary + '55', alignItems: 'center', justifyContent: 'center' }}>
                      <T variant="h1" color={p.primary}>{digit}</T>
                    </View>
                  ))}
                </Row>
              </View>
              <T variant="micro" color={p.textFaint} center>
                No SMS gateway is reachable, so the challenge is issued and verified on this device. The check below is the real one.
              </T>
            </Card>
          ) : null}

          <Card>
            <T variant="h3">Enter the 6-digit code</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.sm }}>Sent to {maskDestination(ch.destination)}</T>
            <Field value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr(null); }} placeholder="000000" icon="keypad" keyboardType="number-pad" onSubmit={submitCode} />
            {err ? <Banner kind="danger" text={err} /> : null}
            <Btn title="Verify" icon="checkmark-circle" onPress={submitCode} style={{ marginTop: space.md }} disabled={code.length !== 6} />
            <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
              <T variant="micro" color={p.textFaint}>
                Expires in {Math.max(0, Math.ceil((ch.expiresAt - Date.now()) / 1000))} s · {ch.maxAttempts - ch.attempts} tries left
              </T>
              <Pressable onPress={resend} disabled={!canResend(ch)}>
                <T variant="micro" color={canResend(ch) ? p.primary : p.textFaint}>
                  {canResend(ch) ? 'RESEND CODE' : `RESEND IN ${resendIn(ch)}s`}
                </T>
              </Pressable>
            </Row>
          </Card>
          <Btn title="Use a different number" kind="ghost" icon="arrow-back" onPress={() => { setStep(1); setCh(null); setErr(null); }} />
        </>
      ) : null}

      {/* ----------------------------- profile ---------------------------- */}
      {step === 3 ? (
        <>
          <Card>
            <Row gap={12} style={{ marginBottom: space.md }}>
              <Image source={avatarFor(name || 'farmer')} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <T variant="h2">What is your name?</T>
                <T variant="small" color={p.textDim}>This is how the app greets you.</T>
              </View>
            </Row>
            <Field value={name} onChangeText={setName} placeholder="Your name" icon="person" />
            <Divider />
            <T variant="h3">What do you grow most?</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.sm }}>Tap a picture. You can add more fields later.</T>
            <Row gap={space.sm} wrap>
              {Object.values(CROPS).map((c) => {
                const on = crop === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => { setCrop(c.key); speak(c.name, voiceLocale(s.profile.lang)); }}
                    style={{ width: '31.5%', borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm, borderWidth: on ? 2.5 : 1, borderColor: on ? p.primary : p.glassBorder, backgroundColor: p.card }}
                  >
                    <Image source={CROP_IMG[c.key]} style={{ width: '100%', height: 62 }} contentFit="cover" />
                    <T variant="small" center color={on ? p.primary : p.text} style={{ paddingVertical: 7 }}>{c.name}</T>
                  </Pressable>
                );
              })}
            </Row>
          </Card>
          <Row gap={space.sm}>
            <Btn title="Back" kind="ghost" icon="arrow-back" style={{ flex: 1 }} onPress={() => setStep(2)} />
            <Btn title="Next" icon="arrow-forward" style={{ flex: 1.5 }} onPress={() => setStep(4)} disabled={!name.trim()} />
          </Row>
        </>
      ) : null}

      {/* ----------------------------- location --------------------------- */}
      {step === 4 ? (
        <>
          <Card>
            <T variant="h2">Where is your farm?</T>
            <T variant="small" color={p.textDim} style={{ marginBottom: space.md }}>
              Weather, satellite passes, market distance and disease alerts are all worked out from this. It stays on your phone.
            </T>
            <Btn
              title={locating ? 'Finding you…' : 'Use my current location'}
              icon="navigate"
              loading={locating}
              onPress={useGps}
            />
            {geoMsg ? <Banner kind={gps ? 'ok' : 'warn'} text={geoMsg} /> : null}
            <Divider />
            <T variant="small" color={p.textDim}>Or search your district</T>
            <View style={{ height: 6 }} />
            <Field value={query} onChangeText={setQuery} placeholder="Type a district, e.g. Shirur, Nashik, Karnal" icon="search" />
            <View style={{ maxHeight: 300, marginTop: space.sm }}>
              {results.map((r) => {
                const on = place?.d === r.d && place?.s === r.s;
                return (
                  <Pressable
                    key={`${r.d}-${r.s}`}
                    onPress={() => { setPlace(r); setQuery(r.d); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.md, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? p.primary : p.glassBorder, backgroundColor: on ? p.primary + '12' : 'transparent', marginBottom: 6 }}
                  >
                    <Ionicons name={on ? 'location' : 'location-outline'} size={19} color={on ? p.primary : p.textFaint} />
                    <View style={{ flex: 1 }}>
                      <T variant="h3">{r.d}</T>
                      <T variant="micro" color={p.textDim}>{r.s} · {r.z} · {r.soil} soil · {r.rain} mm normal rain</T>
                    </View>
                  </Pressable>
                );
              })}
              {results.length === 0 ? <T variant="small" color={p.textDim}>No district matches “{query}”. Try the nearest big town.</T> : null}
            </View>
          </Card>

          {place ? (
            <Card glow>
              <SectionTitle title="Your farm profile" icon="checkmark-circle" />
              <KV k="Name" v={name || 'Farmer'} />
              <KV k="Signed in as" v={ch ? maskDestination(ch.destination) : '—'} />
              <KV k="District" v={`${place.d}, ${place.s}`} />
              <KV k="Agro-climatic zone" v={place.z} />
              <KV k="Typical soil" v={place.soil} />
              <KV k="Normal rainfall" v={`${place.rain} mm/year`} />
              <KV k="Coordinates" v={gps ? `${gps.lat}, ${gps.lon} (GPS)` : `${place.lat}, ${place.lon} (district centre)`} />
              <KV k="Main crop" v={CROPS[crop].name} />
            </Card>
          ) : null}

          <Row gap={space.sm} style={{ marginBottom: space.xl }}>
            <Btn title="Back" kind="ghost" icon="arrow-back" style={{ flex: 1 }} onPress={() => setStep(3)} />
            <Btn title="Start using CropCare" icon="checkmark-circle" style={{ flex: 1.8 }} onPress={finish} disabled={!place} />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}
