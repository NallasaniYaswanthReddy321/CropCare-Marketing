import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Btn, Card, Chip, Divider, Field, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Sheet, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { LANGS, makeT, voiceLocale } from '../lib/i18n';
import { SYSTEM_PROMPT, askOllama, localAgronomist } from '../lib/agronomist';
import { activeField, fieldSummary } from '../lib/derive';
import { CROPS } from '../lib/agro';
import { compareMarkets, inr } from '../lib/price';
import { listen, speak, stopSpeaking, voiceAvailable } from '../lib/voice';
import { uid } from '../lib/crypto';

const SUGGESTIONS = [
  'Should I irrigate today?',
  'My leaves have brown spots with yellow edges',
  'Where do I get the best net price?',
  'How much nitrogen for tomato at flowering?',
  'Is it safe to spray this week?',
  'When will my crop be ready to harvest?',
];

export default function AdvisorScreen() {
  const { p } = useTheme();
  const { s, set, audit } = useApp();
  const t = makeT(s.profile.lang);
  const f = activeField(s);
  const sum = React.useMemo(() => fieldSummary(f), [f.id]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [engine, setEngine] = React.useState<'auto' | 'offline'>('auto');
  const [listening, setListening] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState(false);
  const scroller = React.useRef<ScrollView>(null);
  const listener = React.useRef<any>(null);

  const market = React.useMemo(() => compareMarkets({ crop: f.crop, qualityScore: 74, grade: 'B', quantityQuintal: 20, vehicleId: 'tempo' }), [f.crop]);
  const lastScan = s.scans[0];

  const ctx = {
    farmName: f.name, crop: CROPS[f.crop].name, areaHa: f.areaHa, das: sum.das,
    stage: sum.ph.series[sum.ph.series.length - 1]?.stage ?? 'Vegetative',
    depletionPct: sum.irr.depletionPct, irrigateNow: sum.irr.irrigateNow,
    lastScan: lastScan?.title, lastGrade: lastScan?.grade,
    bestMandi: market[0].mandi.name, bestNet: market[0].net,
    weather: `${sum.weather[0].tMax}°C max, RH ${sum.weather[0].rhMean}%, ${sum.weather[0].rainMm} mm rain`,
    lang: s.profile.lang,
    memory: s.chat.filter((m) => m.role === 'user').slice(-4).map((m) => m.text),
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput('');
    setBusy(true);
    setStatus(null);
    const userMsg = { id: uid('msg'), role: 'user' as const, text: q, ts: Date.now(), lang: s.profile.lang };
    set((d) => ({ ...d, chat: [...d.chat, userMsg] }));
    audit({ actor: s.profile.id, action: 'advisor:ask', resource: `field:${f.id}`, outcome: 'info' });

    let answer = '';
    let cites: string[] = [];
    let used = 'offline-rag';
    const local = localAgronomist(q, ctx);
    if (engine === 'auto' && !s.settings.airplane) {
      try {
        const contextBlock = `FIELD STATE\ncrop=${ctx.crop} area=${ctx.areaHa}ha day=${ctx.das} stage=${ctx.stage}\nroot-zone depletion=${ctx.depletionPct}% irrigate_now=${ctx.irrigateNow}\nweather=${ctx.weather}\nbest_net_market=${ctx.bestMandi} (${inr(ctx.bestNet)})\nlanguage=${s.profile.lang}\n\nKNOWLEDGE\n${local.cites.join('\n')}\n\nQUESTION: ${q}`;
        answer = await askOllama(s.settings.ollamaEndpoint, s.settings.ollamaModel, contextBlock, SYSTEM_PROMPT, 9000);
        used = `ollama:${s.settings.ollamaModel}`;
      } catch (e: any) {
        setStatus(`Ollama unreachable (${e?.message ?? 'no route'}) — answered with the on-device retrieval agronomist.`);
      }
    }
    if (!answer) { answer = local.answer; cites = local.cites; }
    const msg = { id: uid('msg'), role: 'assistant' as const, text: answer, ts: Date.now(), cites, engine: used, lang: s.profile.lang };
    set((d) => ({ ...d, chat: [...d.chat, msg] }));
    setBusy(false);
    if (s.settings.voice) speak(answer, voiceLocale(s.profile.lang));
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 120);
  };

  const toggleMic = () => {
    if (listening) { listener.current?.stop(); setListening(false); return; }
    setStatus(null);
    setListening(true);
    listener.current = listen(
      voiceLocale(s.profile.lang),
      (text, final) => { setInput(text); if (final) { setListening(false); send(text); } },
      (msg) => { setStatus(msg); setListening(false); },
    );
    if (!listener.current) setListening(false);
  };

  return (
    <Screen scroll={false}>
      <ScreenHeader
        title={t('advisor')}
        sub={`${CROPS[f.crop].name} · day ${sum.das} · ${sum.irr.depletionPct}% depleted`}
        icon="chatbubbles"
        right={<Pressable onPress={() => setSettings(true)}><Ionicons name="options" size={22} color={p.textDim} /></Pressable>}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: space.sm }}>
        {LANGS.map((l) => (
          <Chip key={l.code} label={l.native} active={s.profile.lang === l.code} onPress={() => set((d) => ({ ...d, profile: { ...d.profile, lang: l.code } }))} />
        ))}
      </ScrollView>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: space.md }} showsVerticalScrollIndicator={false}>
        {s.chat.length === 0 ? (
          <Card>
            <Row gap={8}><Ionicons name="sparkles" size={16} color={p.primary} /><T variant="h3">Your offline agronomist</T></Row>
            <T variant="small" color={p.textDim} style={{ marginTop: 6, lineHeight: 20 }}>
              I read your live field state — FAO-56 water balance, thermal time, scan history and mandi net values — then ground every answer in a curated knowledge base. I speak nine languages and remember what you told me. If an Ollama model is reachable I use it; otherwise I answer entirely on this device.
            </T>
            <Divider />
            <Row gap={8} wrap>
              {SUGGESTIONS.map((q) => <Chip key={q} label={q} onPress={() => send(q)} />)}
            </Row>
          </Card>
        ) : null}

        {s.chat.map((m) => (
          <View key={m.id} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: space.sm }}>
            <View style={{
              maxWidth: '92%',
              backgroundColor: m.role === 'user' ? p.primary + '22' : p.glass,
              borderWidth: 1, borderColor: m.role === 'user' ? p.primary + '55' : p.glassBorder,
              borderRadius: radius.lg, padding: space.md,
            }}>
              <T variant="body" style={{ lineHeight: 21 }}>{m.text}</T>
              {m.cites?.length ? (
                <>
                  <Divider />
                  {m.cites.map((c) => <Row key={c} gap={6}><Ionicons name="book" size={11} color={p.textFaint} /><T variant="micro" color={p.textFaint}>{c}</T></Row>)}
                </>
              ) : null}
              {m.role === 'assistant' ? (
                <Row gap={10} style={{ marginTop: 8 }}>
                  <Pressable onPress={() => speak(m.text, voiceLocale(m.lang))}><Row gap={4}><Ionicons name="volume-high" size={13} color={p.primary} /><T variant="micro" color={p.primary}>SPEAK</T></Row></Pressable>
                  <Pressable onPress={stopSpeaking}><Row gap={4}><Ionicons name="stop-circle" size={13} color={p.textFaint} /><T variant="micro" color={p.textFaint}>STOP</T></Row></Pressable>
                  <T variant="micro" color={p.textFaint}>{m.engine}</T>
                </Row>
              ) : null}
            </View>
          </View>
        ))}
        {busy ? <Card pad={space.md}><Row gap={8}><Ionicons name="hourglass" size={14} color={p.primary} /><T variant="small" color={p.textDim}>Thinking on device…</T></Row></Card> : null}
        {status ? <Banner kind="warn" text={status} /> : null}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row gap={space.sm} style={{ paddingBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Field value={input} onChangeText={setInput} placeholder={listening ? 'Listening…' : t('askAnything')} icon="mic-outline" onSubmit={() => send(input)} />
          </View>
          <Pressable
            onPress={toggleMic}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: listening ? p.danger : p.surfaceStrong, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.glassBorder }}
          >
            <Ionicons name={listening ? 'stop' : 'mic'} size={19} color={listening ? '#fff' : p.text} />
          </Pressable>
          <Pressable onPress={() => send(input)} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: p.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="send" size={18} color={p.onPrimary} />
          </Pressable>
        </Row>
      </KeyboardAvoidingView>

      <Sheet visible={settings} onClose={() => setSettings(false)} title="Agronomist engine">
        <Card>
          <SectionTitle title="Inference route" icon="hardware-chip" />
          <Row gap={8} wrap>
            <Chip label="Auto (Ollama → offline)" active={engine === 'auto'} onPress={() => setEngine('auto')} />
            <Chip label="Force on-device" active={engine === 'offline'} onPress={() => setEngine('offline')} />
          </Row>
          <Divider />
          <KV k="Ollama endpoint" v={s.settings.ollamaEndpoint} />
          <KV k="Model" v={s.settings.ollamaModel} />
          <KV k="Egress policy" v="SSRF allowlist — loopback + village edge only" />
          <KV k="Voice output" v={s.settings.voice ? 'on' : 'off'} color={s.settings.voice ? p.ok : p.textDim} />
          <KV k="Speech input" v={voiceAvailable() ? 'available' : 'native build required'} />
        </Card>
        <Card>
          <SectionTitle title="Memory" icon="save" />
          <T variant="small" color={p.textDim}>{s.chat.length} messages stored locally and encrypted at rest. The advisor recalls your last four questions to keep context.</T>
          <Btn small kind="ghost" title="Forget conversation" icon="trash" style={{ marginTop: space.sm }} onPress={() => set((d) => ({ ...d, chat: [] }))} />
        </Card>
      </Sheet>
    </Screen>
  );
}
