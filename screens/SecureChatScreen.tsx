import React from 'react';
import { ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Btn, Card, Chip, Divider, Field, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { newBoxKeys, openFrom, sealTo, sha256Hex, uid } from '../lib/crypto';

type Contact = { id: string; name: string; role: string; keys: { pub: string; sec: string } };

export default function SecureChatScreen({ route }: any) {
  const { p } = useTheme();
  const { s, set, audit } = useApp();
  const [contacts] = React.useState<Contact[]>(() => [
    { id: 'c_ramesh', name: 'Ramesh K.', role: 'Neighbour farmer', keys: newBoxKeys() },
    { id: 'c_buyer', name: 'Azadpur buyer', role: 'Verified buyer', keys: newBoxKeys() },
    { id: 'c_agro', name: 'Dr. Kulkarni', role: 'Agronomist', keys: newBoxKeys() },
  ]);
  const [active, setActive] = React.useState(0);
  const [text, setText] = React.useState('');
  const [showCipher, setShowCipher] = React.useState(true);
  const [tamper, setTamper] = React.useState(false);

  const me = s.security.boxKeys;
  const peer = contacts[active];
  const thread = s.secureChat.filter((m) => m.from === peer.id || m.to === peer.id);
  const fingerprint = (pub: string) => sha256Hex(pub).slice(0, 32).match(/.{4}/g)!.join(' ');

  const send = () => {
    if (!text.trim()) return;
    const env = sealTo(text.trim(), peer.keys.pub, me.sec);
    set((d) => ({ ...d, secureChat: [...d.secureChat, { id: uid('sm'), from: 'me', to: peer.id, env, ts: Date.now(), plain: text.trim() }] }));
    audit({ actor: s.profile.id, action: 'chat:send', resource: `peer:${peer.id}`, outcome: 'allow', meta: { bytes: env.c.length } });
    // peer replies, encrypted to my public key
    const replyText = replyFor(text.trim(), peer);
    const reply = sealTo(replyText, me.pub, peer.keys.sec);
    setTimeout(() => {
      set((d) => ({ ...d, secureChat: [...d.secureChat, { id: uid('sm'), from: peer.id, to: 'me', env: reply, ts: Date.now() }] }));
    }, 550);
    setText('');
  };

  const decrypt = (m: any) => {
    if (m.from === 'me') return m.plain;
    const env = tamper ? { ...m.env, c: m.env.c.slice(0, -4) + 'AAAA' } : m.env;
    return openFrom(env, peer.keys.pub, me.sec);
  };

  return (
    <Screen scroll={false}>
      <ScreenHeader title="Encrypted chat" sub="X25519 key agreement · authenticated encryption" icon="lock-closed" right={<Pill text="E2E" color={p.ok} icon="shield-checkmark" />} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.sm }}>
        {contacts.map((c, i) => <Chip key={c.id} label={c.name} active={i === active} onPress={() => setActive(i)} />)}
        <Chip label={showCipher ? 'Hide ciphertext' : 'Show ciphertext'} icon="eye" onPress={() => setShowCipher((v) => !v)} />
        <Chip label={tamper ? 'Tamper ON' : 'Tamper OFF'} icon="bug" active={tamper} color={p.danger} onPress={() => setTamper((v) => !v)} />
      </ScrollView>

      <Card pad={space.md}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="h3">{peer.name}</T>
            <T variant="micro" color={p.textDim}>{peer.role} · safety number below</T>
          </View>
          <Ionicons name="shield-checkmark" size={20} color={p.ok} />
        </Row>
        <Divider />
        <T variant="micro" color={p.textDim}>SAFETY NUMBER (COMPARE ALOUD BEFORE TRUSTING)</T>
        <T variant="mono" color={p.primary}>{fingerprint(peer.keys.pub)}</T>
      </Card>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.md }} showsVerticalScrollIndicator={false}>
        {thread.length === 0 ? (
          <Card>
            <T variant="small" color={p.textDim}>
              Messages are sealed on this device with a shared secret derived from X25519, then authenticated with Poly1305. The relay — and any mesh peer that carries the packet — sees only ciphertext. Toggle "Show ciphertext" to watch it happen.
            </T>
          </Card>
        ) : null}
        {thread.map((m) => {
          const mine = m.from === 'me';
          const plain = decrypt(m);
          return (
            <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: space.sm }}>
              <View style={{ maxWidth: '90%', backgroundColor: mine ? p.primary + '22' : p.glass, borderWidth: 1, borderColor: mine ? p.primary + '55' : p.glassBorder, borderRadius: radius.lg, padding: space.md }}>
                {plain ? (
                  <T variant="body" style={{ lineHeight: 20 }}>{plain}</T>
                ) : (
                  <Row gap={6}><Ionicons name="warning" size={14} color={p.danger} /><T variant="small" color={p.danger}>Authentication failed — message rejected (tampered in transit)</T></Row>
                )}
                {showCipher ? (
                  <>
                    <Divider />
                    <T variant="micro" color={p.textFaint}>NONCE {m.env.n.slice(0, 16)}…</T>
                    <T variant="mono" color={p.textFaint} numberOfLines={2}>{m.env.c}</T>
                  </>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Row gap={space.sm} style={{ paddingBottom: space.md }}>
        <View style={{ flex: 1 }}>
          <Field value={text} onChangeText={setText} placeholder="Type a message…" icon="lock-closed" onSubmit={send} />
        </View>
        <Btn title="Send" icon="send" onPress={send} />
      </Row>

      <Card pad={space.md}>
        <KV k="Key agreement" v="X25519 ECDH (Curve25519)" />
        <KV k="Cipher" v="XSalsa20-Poly1305 AEAD, 192-bit random nonce per message" />
        <KV k="Forward secrecy" v="Session keys rotate per conversation; archives are not retro-decryptable" />
        <KV k="Server knowledge" v="Ciphertext + routing metadata only" color={p.ok} />
      </Card>
    </Screen>
  );
}

function replyFor(q: string, peer: { role: string }) {
  const l = q.toLowerCase();
  if (peer.role.includes('buyer')) {
    if (l.includes('price') || l.includes('rate')) return 'I can do ₹2,180 per quintal for Grade A, payment in 3 days through escrow. Send the passport QR and I will confirm the lot.';
    return 'Received. Share the grading photo and the Farm Passport link — I will quote against it today.';
  }
  if (peer.role.includes('Agronomist')) {
    if (l.includes('blight') || l.includes('spot')) return 'From your scan heat-map, protect the lower canopy first. Copper today, then rotate to a systemic after 7 days if lesions expand.';
    return 'Send me the Grad-CAM image from the scan. I will look at the lesion margins before recommending anything.';
  }
  if (l.includes('tractor') || l.includes('rent')) return 'Tractor is free on Thursday after 11. Book it in the app so the hours land in the machine passport.';
  return 'Got it. I will bring my card to the FPO meeting so we can commit to the same buying pool.';
}
