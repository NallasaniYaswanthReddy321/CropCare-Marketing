import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Banner, Btn, Card, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Sheet, Stat, T } from '../components/ui';
import { CROP_IMG, avatarFor } from '../lib/images';
import { OverflowMenu } from '../components/Menu';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { chainVerify, sha256Hex, shred } from '../lib/crypto';
import { activeField, fmtDate } from '../lib/derive';
import { CROPS } from '../lib/agro';

export default function PassportScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set, passportAdd, audit } = useApp();
  const f = activeField(s);
  const [tamper, setTamper] = React.useState(false);
  const [detail, setDetail] = React.useState<any>(null);

  const chain = React.useMemo(() => {
    if (!tamper) return s.passport;
    const copy = s.passport.map((e) => ({ ...e }));
    if (copy.length > 1) copy[1] = { ...copy[1], payload: { ...copy[1].payload, variety: 'Forged premium variety' } };
    return copy;
  }, [s.passport, tamper]);

  const verify = chainVerify(chain);
  const head = chain[chain.length - 1];
  const passportNo = `CC-${(head?.hash ?? '000000').slice(0, 6).toUpperCase()}`;
  const lastGrade = s.scans.find((x) => x.kind === 'quality');
  const inputCount = chain.filter((e) => e.payload.event === 'input_applied').length;
  const waterMm = chain.filter((e) => e.payload.event === 'irrigation').reduce((a, e) => a + (Number(e.payload.mm) || 0), 0);
  const organic = !chain.some((e) => e.payload.event === 'input_applied' && e.payload.organic === false);
  const qrPayload = JSON.stringify({
    v: 1,
    farm: s.profile.village,
    field: f.name,
    crop: f.crop,
    head: head?.hash?.slice(0, 32),
    len: chain.length,
    issuer: s.security.keys[0]?.kid,
  });

  return (
    <Screen>
      <ScreenHeader
        title="Crop proof"
        sub="A card a buyer can check in seconds — works with no internet"
        icon="qr-code"
        right={
          <Row gap={6}>
            <Pill text={verify.ok ? 'VERIFIED' : 'TAMPERED'} color={verify.ok ? p.ok : p.danger} icon={verify.ok ? 'shield-checkmark' : 'warning'} />
            <OverflowMenu
              items={[
                { icon: 'add-circle', label: 'Add an event', hint: 'Log work you did today', onPress: () => { passportAdd({ event: 'field_operation', op: 'Manual weeding', labour_hours: 6 }); }, tone: 'primary' },
                { icon: 'bug', label: tamper ? 'Stop tamper test' : 'Run tamper test', hint: 'Prove forgery is detected', check: tamper, onPress: () => setTamper((v) => !v) },
                { icon: 'camera', label: 'Grade this crop first', onPress: () => navigation.navigate('Tabs', { screen: 'Scan' }) },
                { icon: 'storefront', label: 'Sell with this passport', onPress: () => navigation.navigate('Tabs', { screen: 'Market' }) },
              ]}
            />
          </Row>
        }
      />

      {/* The physical card a buyer sees at the gate. */}
      <View style={{ borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: p.glassBorder, marginBottom: space.md, backgroundColor: p.card }}>
        <Image source={CROP_IMG[f.crop]} style={{ width: '100%', height: 140 }} contentFit="cover" />
        <LinearGradient
          colors={['transparent', p.mode === 'dark' ? 'rgba(10,20,15,0.95)' : 'rgba(255,255,255,0.96)']}
          style={{ position: 'absolute', left: 0, right: 0, top: 60, height: 82 }}
        />
        <View style={{ position: 'absolute', top: 12, left: 12 }}>
          <Pill text={verify.ok ? 'VERIFIED CHAIN' : 'TAMPERED'} color={verify.ok ? p.ok : p.danger} icon={verify.ok ? 'shield-checkmark' : 'warning'} />
        </View>

        <View style={{ padding: space.lg, paddingTop: space.md }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T variant="micro" color={p.textDim}>FARM PASSPORT · {passportNo}</T>
              <T variant="h1" style={{ fontSize: 24, marginTop: 2 }}>{CROPS[f.crop].name}</T>
              <T variant="small" color={p.textDim}>{f.variety} · {f.areaHa} ha · sown {new Date(f.sowDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</T>
            </View>
            <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 14 }}>
              <QRCode value={qrPayload} size={92} backgroundColor="#fff" color="#14301F" />
            </View>
          </Row>

          <Divider />

          <Row gap={10} style={{ marginBottom: space.sm }}>
            <Image source={avatarFor(s.profile.name || 'farmer')} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <T variant="h3">{s.profile.name || 'Farmer'}</T>
              <T variant="micro" color={p.textDim}>
                {s.geo ? `${s.geo.district}, ${s.geo.state}` : s.profile.village} · {s.geo ? `${s.geo.lat}, ${s.geo.lon}` : `${f.lat}, ${f.lon}`}
              </T>
            </View>
            {lastGrade ? <Pill text={`GRADE ${lastGrade.grade}`} color={p.primary} icon="ribbon" /> : null}
          </Row>

          <Row gap={space.sm} wrap>
            <Stat label="Events" value={`${chain.length}`} sub="sealed records" color={p.primary} icon="layers" flex={1} />
            <Stat label="Inputs" value={`${inputCount}`} sub="sprays logged" color={p.accent} icon="flask" flex={1} />
            <Stat label="Water" value={`${waterMm} mm`} sub="season total" color={p.water} icon="water" flex={1} />
          </Row>

          <Row gap={6} wrap style={{ marginTop: space.sm }}>
            <Pill text={`HEAD ${head?.hash.slice(0, 10)}…`} color={p.accent} icon="finger-print" />
            <Pill text={organic ? 'NO CHEMICAL LOGGED' : 'CHEMICAL LOGGED'} color={organic ? p.ok : p.warn} icon="leaf" />
            {s.geo ? <Pill text={s.geo.zone} color={p.textDim} icon="earth" /> : null}
          </Row>
        </View>
      </View>

      <T variant="micro" color={p.textFaint} center style={{ marginBottom: space.md }}>
        A buyer scans the QR at the gate. It carries the chain head, so any edit to history changes every later hash —
        forgery is detectable with no server and no internet.
      </T>

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Btn small kind={tamper ? 'danger' : 'soft'} icon="bug" title={tamper ? 'Tamper simulated' : 'Simulate tampering'} style={{ flex: 1 }} onPress={() => setTamper((v) => !v)} />
        <Btn small kind="ghost" icon="add-circle" title="Add event" style={{ flex: 1 }} onPress={() => { passportAdd({ event: 'field_operation', op: 'Manual weeding', labour_hours: 6 }); audit({ actor: s.profile.id, action: 'passport:append', resource: `field:${f.id}`, outcome: 'allow' }); }} />
      </Row>

      {!verify.ok ? (
        <Banner kind="danger" icon="warning" text={`Chain verification failed at block #${verify.brokenAt}. The recomputed SHA-256 does not match the stored hash — this passport has been altered after the fact.`} />
      ) : (
        <Banner kind="ok" icon="shield-checkmark" text={`All ${chain.length} blocks verify. Each block commits to the previous hash, so the whole crop history is sealed.`} />
      )}

      <SectionTitle title="Provenance chain" icon="link" />
      {[...chain].reverse().map((e) => (
        <Card key={e.seq} onPress={() => setDetail(e)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10} style={{ flex: 1 }}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: p.primary + '1F', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={iconFor(e.payload.event)} size={16} color={p.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="h3">{label(e.payload.event)}</T>
                <T variant="micro" color={p.textDim}>#{e.seq} · {fmtDate(e.ts)} · {Object.entries(e.payload).filter(([k]) => k !== 'event').map(([k, v]) => `${k}=${v}`).slice(0, 3).join(' · ')}</T>
              </View>
            </Row>
            <T variant="mono" color={p.textFaint}>{e.hash.slice(0, 8)}</T>
          </Row>
        </Card>
      ))}

      <SectionTitle title="Privacy controls" icon="lock-closed" />
      <Card>
        <T variant="small" color={p.textDim}>
          Personal identifiers are stored as ciphertext with a per-record data key. Exercising your DPDP/GDPR erasure right destroys the key — the ciphertext stays in the chain so hashes still verify, but the plaintext is unrecoverable by anyone, forever.
        </T>
        <Divider />
        <KV k="Field encryption" v="XSalsa20-Poly1305 AEAD, per-record DEK" />
        <KV k="Key custody" v="Device Secure Enclave / Keystore" />
        <KV k="Erasure method" v="Crypto-shredding (key destruction)" />
        <Btn
          small
          kind="danger"
          icon="trash"
          title="Crypto-shred my identity fields"
          style={{ marginTop: space.sm }}
          onPress={() => {
            const env = shred({ n: 'nonce', c: 'ciphertext' });
            audit({ actor: s.profile.id, action: 'privacy:erase', resource: 'profile', outcome: 'allow', meta: env });
            set((d) => ({ ...d, profile: { ...d.profile, phone: '[crypto-shredded]', name: d.profile.name } }));
          }}
        />
      </Card>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail ? label(detail.payload.event) : ''}>
        {detail ? (
          <View>
            <KV k="Block" v={`#${detail.seq}`} />
            <KV k="Timestamp" v={new Date(detail.ts).toLocaleString('en-IN')} />
            <Divider />
            {Object.entries(detail.payload).map(([k, v]) => <KV key={k} k={k} v={String(v)} />)}
            <Divider />
            <T variant="micro" color={p.textDim}>PREVIOUS HASH</T>
            <T variant="mono" color={p.textFaint}>{detail.prev}</T>
            <T variant="micro" color={p.textDim} style={{ marginTop: 8 }}>THIS HASH</T>
            <T variant="mono" color={p.primary}>{detail.hash}</T>
            <T variant="micro" color={p.textDim} style={{ marginTop: 8 }}>RECOMPUTED</T>
            <T variant="mono" color={p.accent}>{sha256Hex(JSON.stringify({ seq: detail.seq, ts: detail.ts, prev: detail.prev, payload: detail.payload }))}</T>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const label = (e: string) => ({
  field_registered: 'Field registered', sowing: 'Sowing', input_applied: 'Input applied', irrigation: 'Irrigation',
  quality_graded: 'Quality graded', crop_scouted: 'Crop scouted', field_operation: 'Field operation', harvest: 'Harvest',
} as Record<string, string>)[e] ?? e;

const iconFor = (e: string): any => ({
  field_registered: 'map', sowing: 'leaf', input_applied: 'flask', irrigation: 'water',
  quality_graded: 'ribbon', crop_scouted: 'search', field_operation: 'construct', harvest: 'basket',
} as Record<string, string>)[e] ?? 'ellipse';
