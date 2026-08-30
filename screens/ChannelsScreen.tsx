import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Btn, Card, Chip, Divider, Field, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField, fieldSummary } from '../lib/derive';
import { CROPS } from '../lib/agro';
import { compareMarkets, inr, priceRange } from '../lib/price';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';

type Node = { title: string; options?: { key: string; label: string; to: string }[]; render?: () => string };

export default function ChannelsScreen() {
  const { p } = useTheme();
  const { s } = useApp();
  const f = activeField(s);
  const sum = React.useMemo(() => fieldSummary(f), [f.id]);
  const market = React.useMemo(() => compareMarkets({ crop: f.crop, qualityScore: 74, grade: 'B', quantityQuintal: 20, vehicleId: 'tempo' }), [f.crop]);
  const pr = priceRange({ crop: f.crop, qualityScore: 74, grade: 'B', quantityQuintal: 20 });

  const [tab, setTab] = React.useState<'ussd' | 'sms' | 'whatsapp' | 'ivr'>('ussd');
  const [node, setNode] = React.useState('root');
  const [history, setHistory] = React.useState<string[]>([]);
  const [sms, setSms] = React.useState('PRICE TOMATO 20');
  const [smsOut, setSmsOut] = React.useState<string | null>(null);

  const TREE: Record<string, Node> = {
    root: {
      title: 'CropCare *123#\n1. Water advice\n2. Price check\n3. Disease help\n4. My score\n0. Exit',
      options: [
        { key: '1', label: 'Water advice', to: 'water' },
        { key: '2', label: 'Price check', to: 'price' },
        { key: '3', label: 'Disease help', to: 'disease' },
        { key: '4', label: 'My score', to: 'score' },
      ],
    },
    water: {
      title: '',
      render: () => sum.irr.irrigateNow
        ? `WATER\n${CROPS[f.crop].name} ${f.areaHa}ha\nIrrigate ${sum.irr.grossDepthMm}mm today\nRun ${sum.irr.hoursToRun}h\nDepletion ${sum.irr.depletionPct}%\n0. Back`
        : `WATER\nNo irrigation today.\nDepletion ${sum.irr.depletionPct}% of TAW.\nCheck again in ${sum.irr.nextCheckDays}d\n0. Back`,
    },
    price: {
      title: '',
      render: () => `PRICE (AI estimate)\n${CROPS[f.crop].name} Grade B\nRs${pr.low}-${pr.high}/qtl\nBest net: ${market[0].mandi.name}\nNet ${inr(market[0].net)} for 20q\nNot a guaranteed price\n0. Back`,
    },
    disease: {
      title: '',
      render: () => `DISEASE\nRisk today: ${sum.risk.disease.length ? 'HIGH' : 'LOW'}\n${sum.risk.disease.length ? 'RH high + warm = spray window before rain' : 'No infection window in 3 days'}\nSend photo on WhatsApp for a scan\n0. Back`,
    },
    score: {
      title: '',
      render: () => `FARMSCORE\n${s.farmScore.score}/900 (${s.farmScore.band})\nCredit limit approx Rs45,000\nRate approx 11.5%\n0. Back`,
    },
  };

  const press = (key: string) => {
    setHistory((h) => [...h, key]);
    if (key === '0') { setNode('root'); return; }
    const opt = TREE[node].options?.find((o) => o.key === key);
    if (opt) setNode(opt.to);
  };

  const runSms = () => {
    const parts = sms.trim().toUpperCase().split(/\s+/);
    const cmd = parts[0];
    if (cmd === 'PRICE') {
      const cropKey = (Object.keys(CROPS) as (keyof typeof CROPS)[]).find((c) => c.toUpperCase() === parts[1]) ?? f.crop;
      const qty = Number(parts[2]) || 20;
      const r = priceRange({ crop: cropKey, qualityScore: 74, grade: 'B', quantityQuintal: qty });
      const m = compareMarkets({ crop: cropKey, qualityScore: 74, grade: 'B', quantityQuintal: qty, vehicleId: 'tempo' });
      setSmsOut(`CROPCARE: ${CROPS[cropKey].name} est Rs${r.low}-${r.high}/qtl. Best NET ${m[0].mandi.name} ${inr(m[0].net)} for ${qty}q after transport+loss. AI estimate, not guaranteed. Reply HELP.`);
    } else if (cmd === 'WATER') {
      setSmsOut(`CROPCARE: ${sum.irr.irrigateNow ? `Irrigate ${sum.irr.grossDepthMm}mm today (${sum.irr.hoursToRun}h run).` : `No irrigation today. Depletion ${sum.irr.depletionPct}%.`} ET0 ${sum.irr.et0}mm Kc ${sum.irr.kc}.`);
    } else if (cmd === 'SELL') {
      setSmsOut(`CROPCARE: Best net today ${market[0].mandi.name} ${inr(market[0].netPerQ)}/qtl net. Holding 2 days: check quality decay. AI estimate.`);
    } else if (cmd === 'HELP') {
      setSmsOut('CROPCARE cmds: PRICE <crop> <qty> | WATER | SELL | SCORE | STOP. Standard SMS rates apply. Works on any 2G phone.');
    } else if (cmd === 'SCORE') {
      setSmsOut(`CROPCARE: FarmScore ${s.farmScore.score}/900 (${s.farmScore.band}). Limit approx Rs45,000 at 11.5% pa.`);
    } else {
      setSmsOut('CROPCARE: Command not recognised. Send HELP for the list.');
    }
  };

  const waMessages = [
    { from: 'farmer', text: '[photo of tomato leaf]' },
    { from: 'bot', text: `Scan complete on device. Late blight likelihood 78%. Protect within 48 h: copper oxychloride 3 g/L now, remove infected leaves at dawn. Rain in 2 days — spray today. Reply 2 for the chemical option, 3 to alert the village.` },
    { from: 'farmer', text: '2' },
    { from: 'bot', text: 'Cymoxanil 8% + Mancozeb 64% at 2 g/L, repeat after 7 days. Pre-harvest interval 7 days. Logged to your Farm Passport ✓' },
  ];

  return (
    <Screen>
      <ScreenHeader title="Any phone, any network" sub="WhatsApp · SMS · USSD · IVR — no smartphone required" icon="chatbox-ellipses" right={<Pill text="2G READY" color={p.ok} />} />

      <Row gap={8} wrap style={{ marginBottom: space.md }}>
        {(['ussd', 'sms', 'whatsapp', 'ivr'] as const).map((x) => (
          <Chip key={x} label={x.toUpperCase()} active={tab === x} onPress={() => setTab(x)} />
        ))}
      </Row>

      {tab === 'ussd' ? (
        <>
          <Card style={{ backgroundColor: '#0B0F0C', borderColor: '#1E3A24' }}>
            <T variant="mono" color="#6EE787" style={{ lineHeight: 20 }}>
              {node === 'root' ? TREE.root.title : TREE[node].render?.()}
            </T>
          </Card>
          <Row gap={8} wrap style={{ marginBottom: space.md }}>
            {['1', '2', '3', '4', '0'].map((k) => (
              <Btn key={k} small kind="soft" title={k} style={{ width: 54 }} onPress={() => press(k)} />
            ))}
          </Row>
          <Card>
            <KV k="Session" v={`*123# · ${history.length} inputs · ${history.join('→') || 'start'}`} />
            <KV k="Latency budget" v="< 180 s per session (GSM 02.90)" />
            <KV k="Data cost" v="Zero — signalling channel, works with no data pack" />
            <KV k="Fallback" v="If the gateway is down, the same menu is answered by the village edge box over SMS." />
          </Card>
        </>
      ) : null}

      {tab === 'sms' ? (
        <>
          <Card>
            <Field value={sms} onChangeText={setSms} placeholder="PRICE TOMATO 20" icon="chatbubble" onSubmit={runSms} />
            <Row gap={8} wrap style={{ marginTop: space.sm }}>
              {['PRICE TOMATO 20', 'WATER', 'SELL', 'SCORE', 'HELP'].map((c) => <Chip key={c} label={c} onPress={() => setSms(c)} />)}
            </Row>
            <Btn small title="Send to 56070" icon="send" style={{ marginTop: space.sm }} onPress={runSms} />
          </Card>
          {smsOut ? (
            <Card style={{ backgroundColor: p.surfaceStrong }}>
              <Row gap={8}><Ionicons name="chatbubble" size={14} color={p.primary} /><T variant="micro" color={p.textDim}>FROM CROPCARE · 160-CHAR SAFE</T></Row>
              <T variant="small" style={{ marginTop: 6, lineHeight: 20 }}>{smsOut}</T>
              <T variant="micro" color={p.textFaint} style={{ marginTop: 6 }}>{smsOut.length} characters · {Math.ceil(smsOut.length / 160)} SMS segment(s)</T>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'whatsapp' ? (
        <Card style={{ padding: space.md }}>
          {waMessages.map((m, i) => (
            <View key={i} style={{ alignSelf: m.from === 'farmer' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: m.from === 'farmer' ? '#128C7E33' : p.surface, borderRadius: radius.md, padding: space.md, marginBottom: 8, borderWidth: 1, borderColor: p.glassBorder }}>
              <T variant="small" style={{ lineHeight: 20 }}>{m.text}</T>
            </View>
          ))}
          <Divider />
          <KV k="Transport" v="WhatsApp Business Cloud API (free tier) or Signal bot" />
          <KV k="Privacy" v="Photos are processed by the village edge box, not a third-party cloud" />
          <KV k="Webhook security" v="HMAC signature + 300 s replay window" />
        </Card>
      ) : null}

      {tab === 'ivr' ? (
        <>
          <Card>
            <SectionTitle title="Voice menu (Piper TTS)" icon="call" />
            {[
              { k: '1', text: `Today, ${sum.irr.irrigateNow ? `irrigate ${sum.irr.grossDepthMm} millimetres` : 'no irrigation is needed'}. Root zone depletion is ${sum.irr.depletionPct} percent.` },
              { k: '2', text: `Estimated price for ${CROPS[f.crop].name} is between ${pr.low} and ${pr.high} rupees per quintal. This is an estimate, not a guaranteed price.` },
              { k: '3', text: `Disease pressure today is ${sum.risk.disease.length ? 'high' : 'low'}. ${sum.risk.disease.length ? 'Spray before the next wet window.' : 'No action needed.'}` },
              { k: '4', text: `Your farm score is ${s.farmScore.score} out of 900, which is rated ${s.farmScore.band}.` },
            ].map((o) => (
              <Row key={o.k} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
                <Row gap={9} style={{ flex: 1 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: p.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <T variant="small" color={p.primary}>{o.k}</T>
                  </View>
                  <T variant="small" style={{ flex: 1 }} numberOfLines={2}>{o.text}</T>
                </Row>
                <Btn small kind="ghost" icon="play" title="Play" onPress={() => speak(o.text, voiceLocale(s.profile.lang))} />
              </Row>
            ))}
          </Card>
          <Banner kind="info" icon="mic" text="Outbound IVR calls the farmer at 06:30 with the day's water and price advice in their language. Input is DTMF, so it works on the oldest handset in the village." />
        </>
      ) : null}
    </Screen>
  );
}
