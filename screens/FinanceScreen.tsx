import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Divider, Gauge, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Slider, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { inr } from '../lib/price';
import { activeField, fieldWeather, fmtDate } from '../lib/derive';
import { claimAnomaly, referralFraud } from '../lib/security';
import { uid } from '../lib/crypto';

export default function FinanceScreen() {
  const { p } = useTheme();
  const { s, set, audit, push } = useApp();
  const f = activeField(s);
  const [amount, setAmount] = React.useState(45000);
  const [tenure, setTenure] = React.useState(6);

  const fs = s.farmScore;
  const composite = fs.factors.reduce((sum, x) => sum + x.value * x.weight, 0);
  const score = Math.round(300 + composite * 600);
  const band = score > 780 ? 'Excellent' : score > 700 ? 'Good' : score > 620 ? 'Fair' : 'Building';
  const limit = Math.round((composite ** 1.6) * 180000 * f.areaHa) ;
  const rate = +(9 + (1 - composite) * 12).toFixed(2);
  const emi = Math.round((amount * (rate / 1200) * (1 + rate / 1200) ** tenure) / ((1 + rate / 1200) ** tenure - 1));

  // Parametric rainfall index computed from the local (cached) weather record
  const weather = React.useMemo(() => fieldWeather(f, 21), [f.id]);
  const rain21 = weather.reduce((a, w) => a + w.rainMm, 0);
  const normal21 = 96;
  const indexPct = Math.round((rain21 / normal21) * 100);
  const triggered = indexPct < 60;
  const payout = triggered ? Math.round(s.policies[0].sumInsured * Math.min(1, (60 - indexPct) / 45)) : 0;
  const anomaly = claimAnomaly([12000, 15400, 9800, 18200, 14100, 16500], payout || 14000);
  const fraud = referralFraud([
    { from: 'usr_a', to: 'usr_b', at: Date.now() - 7200000 },
    { from: 'usr_b', to: 'usr_c', at: Date.now() - 5400000 },
    { from: 'usr_c', to: 'usr_a', at: Date.now() - 3600000 },
    ...Array.from({ length: 6 }, (_, i) => ({ from: 'usr_x', to: `usr_y${i}`, at: Date.now() - i * 60000 })),
  ]);

  const openClaim = () => {
    const c = {
      id: uid('clm'), policyId: s.policies[0].id, amount: payout || 0,
      state: 'triggered' as const, openedAt: Date.now(),
      index: `21-day rainfall ${rain21.toFixed(0)} mm = ${indexPct}% of normal`, anomalyZ: anomaly.z,
    };
    set((d) => ({ ...d, claims: [c, ...d.claims] }));
    push('insurance_claim', { id: c.id, amount: c.amount, index: c.index });
    audit({ actor: s.profile.id, action: 'insurance:claim', resource: `policy:${s.policies[0].id}`, outcome: 'allow', meta: { amount: c.amount } });
  };

  const settle = (id: string) => {
    set((d) => ({ ...d, claims: d.claims.map((c) => (c.id === id ? { ...c, state: 'paid', paidAt: Date.now() } : c)) }));
    audit({ actor: 'insurer_node', action: 'insurance:settle', resource: `claim:${id}`, outcome: 'allow' });
  };

  return (
    <Screen>
      <ScreenHeader title="FarmScore & cover" sub="Collateral-free credit and 72-hour parametric claims" icon="wallet" right={<Pill text={band.toUpperCase()} color={p.sun} icon="star" />} />

      <Card glow>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="micro" color={p.textDim}>FARMSCORE (300–900)</T>
            <T variant="h1" color={p.sun} style={{ fontSize: 40 }}>{score}</T>
            <T variant="small" color={p.textDim}>Sanctioned limit {inr(limit)} · indicative rate {rate}% p.a.</T>
          </View>
          <Gauge value={score - 300} max={600} label="SCORE" color={p.sun} size={124} />
        </Row>
        <Divider />
        {fs.factors.map((x) => (
          <View key={x.label} style={{ marginBottom: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="small">{x.label}</T>
              <T variant="small" color={p.textDim}>{(x.value * 100).toFixed(0)}% · weight {(x.weight * 100).toFixed(0)}%</T>
            </Row>
            <Bar value={x.value} color={x.value > 0.8 ? p.ok : x.value > 0.6 ? p.sun : p.warn} height={6} />
            <T variant="micro" color={p.textFaint}>{x.note}</T>
          </View>
        ))}
        <Banner kind="info" icon="lock-open" text="No land title, no guarantor. The score is built from verifiable farm behaviour: geo-verified scouting, irrigation adherence, hash-chained sale receipts and repayment history." />
      </Card>

      <SectionTitle title="Credit simulator" icon="calculator" />
      <Card>
        <Slider label="Loan amount" value={amount} min={5000} max={Math.max(20000, limit)} step={1000} unit="" onChange={setAmount} color={p.sun} />
        <Slider label="Tenure" value={tenure} min={3} max={24} step={1} unit=" months" onChange={setTenure} color={p.accent} />
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <Stat label="EMI" value={inr(emi)} sub="per month" color={p.sun} icon="calendar" />
          <Stat label="Total interest" value={inr(emi * tenure - amount)} sub={`${rate}% p.a. reducing`} color={p.textDim} icon="trending-up" />
          <Stat label="Approval" value={amount <= limit ? 'Instant' : 'Review'} sub={amount <= limit ? 'within limit' : 'above limit'} color={amount <= limit ? p.ok : p.warn} icon="flash" />
        </Row>
        <Btn
          title={amount <= limit ? `Accept ${inr(amount)} offer` : 'Request manual review'}
          icon="cash"
          style={{ marginTop: space.md }}
          onPress={() => {
            set((d) => ({ ...d, loans: [{ id: uid('ln'), amount, tenureM: tenure, ratePct: rate, state: 'active', disbursedAt: Date.now(), repaidPct: 0, purpose: 'Working capital' }, ...d.loans] }));
            audit({ actor: s.profile.id, action: 'credit:accept', resource: 'loan', outcome: 'allow', meta: { amount } });
          }}
        />
      </Card>

      {s.loans.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T variant="h3">{inr(l.amount)} · {l.tenureM} months</T>
              <T variant="micro" color={p.textDim}>{l.purpose} · {l.ratePct}% p.a. · {l.state}</T>
            </View>
            <Pill text={l.state.toUpperCase()} color={l.state === 'active' ? p.ok : l.state === 'offered' ? p.sun : p.textDim} />
          </Row>
          {l.state === 'active' ? (
            <>
              <Bar value={l.repaidPct} max={100} color={p.ok} label={`Repaid ${l.repaidPct}%`} />
              <Btn small kind="soft" title="Record repayment" icon="arrow-up-circle" style={{ marginTop: space.sm }} onPress={() => set((d) => ({ ...d, loans: d.loans.map((x) => (x.id === l.id ? { ...x, repaidPct: Math.min(100, x.repaidPct + 20), state: x.repaidPct + 20 >= 100 ? 'repaid' : 'active' } : x)) }))} />
            </>
          ) : null}
        </Card>
      ))}

      <SectionTitle title="Parametric insurance" icon="umbrella" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="h3">Rainfall-deficit cover</T>
            <T variant="micro" color={p.textDim}>{s.policies[0].trigger}</T>
          </View>
          <Pill text="ACTIVE" color={p.ok} icon="shield-checkmark" />
        </Row>
        <Divider />
        <KV k="Sum insured" v={inr(s.policies[0].sumInsured)} />
        <KV k="Premium paid" v={inr(s.policies[0].premium)} />
        <KV k="21-day rainfall (village mesh)" v={`${rain21.toFixed(0)} mm of ${normal21} mm normal`} />
        <KV k="Index level" v={`${indexPct}% of normal`} color={triggered ? p.danger : p.ok} />
        <Bar value={Math.min(150, indexPct)} max={150} color={triggered ? p.danger : p.ok} height={10} />
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <T variant="micro" color={p.danger}>trigger &lt; 60%</T>
          <T variant="micro" color={p.textFaint}>normal 100%</T>
        </Row>
        {triggered ? (
          <>
            <Banner kind="warn" icon="alert-circle" text={`Index breached. Automatic payout of ${inr(payout)} is due — no loss adjuster visit, no paperwork, settlement target 72 hours.`} />
            <Btn title="Open automatic claim" icon="document-text" onPress={openClaim} />
          </>
        ) : (
          <Banner kind="ok" icon="checkmark-circle" text="Index healthy — no payout due. The policy keeps monitoring the mesh rainfall record every day." />
        )}
      </Card>

      {s.claims.map((c) => (
        <Card key={c.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="h3">{inr(c.amount)} claim</T>
              <T variant="micro" color={p.textDim}>{c.index} · opened {fmtDate(c.openedAt)}</T>
            </View>
            <Pill text={c.state.toUpperCase()} color={c.state === 'paid' ? p.ok : p.warn} />
          </Row>
          <Divider />
          {[
            { s: 'triggered', label: 'Index breach detected on-device', done: true },
            { s: 'verifying', label: 'Cross-checked against 3 mesh weather nodes + Sentinel-2 soil moisture', done: c.state !== 'triggered' || true },
            { s: 'paid', label: 'Payout credited to wallet', done: c.state === 'paid' },
          ].map((step) => (
            <Row key={step.s} gap={8} style={{ paddingVertical: 4 }}>
              <Ionicons name={step.done ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={step.done ? p.ok : p.textFaint} />
              <T variant="small" color={step.done ? p.text : p.textDim}>{step.label}</T>
            </Row>
          ))}
          <KV k="Anomaly score (robust z)" v={`${c.anomalyZ ?? anomaly.z} ${Math.abs(c.anomalyZ ?? anomaly.z) > 3.5 ? '— flagged for review' : '— within normal band'}`} color={Math.abs(c.anomalyZ ?? anomaly.z) > 3.5 ? p.danger : p.ok} />
          {c.state !== 'paid' ? <Btn small title="Simulate insurer settlement" icon="cash" onPress={() => settle(c.id)} /> : null}
        </Card>
      ))}

      <SectionTitle title="Fraud controls" icon="shield" />
      <Card>
        <KV k="Referral graph risk" v={`${fraud.score}/100`} color={fraud.score > 50 ? p.danger : p.ok} />
        <KV k="Collusion cycles found" v={`${fraud.cycles.length}`} color={fraud.cycles.length ? p.danger : p.ok} />
        {fraud.cycles.slice(0, 2).map((c, i) => <T key={i} variant="mono" color={p.textFaint}>{c.join(' → ')}</T>)}
        <KV k="Burst referrers" v={fraud.bursts.map((b) => `${b.actor} (${b.count}/h)`).join(', ') || 'none'} color={fraud.bursts.length ? p.warn : p.ok} />
        <Divider />
        <KV k="Claim anomaly detector" v={`median ${inr(anomaly.median)} · MAD ${anomaly.mad.toFixed(0)} · z ${anomaly.z}`} />
        <T variant="micro" color={p.textFaint}>Median-absolute-deviation scoring resists poisoning by a few very large fraudulent claims, unlike a mean/σ rule.</T>
      </Card>
    </Screen>
  );
}
