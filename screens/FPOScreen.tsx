import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Btn, Card, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Sheet, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { chainAppend, chainVerify } from '../lib/crypto';
import { inr } from '../lib/price';
import { fmtDate } from '../lib/derive';

export default function FPOScreen() {
  const { p } = useTheme();
  const { s, set, audit, push } = useApp();
  const [detail, setDetail] = React.useState<any>(null);

  const verify = chainVerify(s.ledger);
  const balance = s.ledger.reduce((a, e) => a + e.payload.amount, 0);
  const inflow = s.ledger.filter((e) => e.payload.amount > 0).reduce((a, e) => a + e.payload.amount, 0);
  const outflow = s.ledger.filter((e) => e.payload.amount < 0).reduce((a, e) => a + Math.abs(e.payload.amount), 0);
  const members = Array.from(new Set(s.ledger.map((e) => e.payload.member))).filter((m) => m !== 'FPO');

  const post = (kind: 'contribution' | 'payout' | 'purchase' | 'sale', amount: number, note: string) => {
    set((d) => ({ ...d, ledger: [...d.ledger, chainAppend(d.ledger, { kind, member: d.profile.name, amount, note })] }));
    push('ledger_entry', { kind, amount, note });
    audit({ actor: s.profile.id, action: 'ledger:write', resource: 'fpo_ledger', outcome: 'allow', meta: { kind, amount } });
  };

  return (
    <Screen>
      <ScreenHeader title="FPO group ledger" sub="Shared books nobody can quietly edit" icon="people-circle" right={<Pill text={verify.ok ? 'VERIFIED' : 'TAMPERED'} color={verify.ok ? p.ok : p.danger} icon="link" />} />

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Balance" value={inr(balance)} sub={`${s.ledger.length} entries`} color={balance >= 0 ? p.ok : p.danger} icon="wallet" />
        <Stat label="Inflow" value={inr(inflow)} sub="contributions + sales" color={p.ok} icon="arrow-down" />
        <Stat label="Outflow" value={inr(outflow)} sub="purchases + payouts" color={p.warn} icon="arrow-up" />
      </Row>

      <Banner
        kind={verify.ok ? 'ok' : 'danger'}
        icon="shield-checkmark"
        text={verify.ok
          ? 'Every entry commits to the hash of the previous one. Members hold identical copies on their phones, so a treasurer cannot retro-edit a single rupee without every device noticing.'
          : `Chain broken at entry #${verify.brokenAt} — the ledger no longer matches its hashes.`}
      />

      <SectionTitle title="Members" icon="people" />
      <Card>
        {members.map((m) => {
          const mine = s.ledger.filter((e) => e.payload.member === m);
          const net = mine.reduce((a, e) => a + e.payload.amount, 0);
          return (
            <Row key={m} style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
              <Row gap={9}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: p.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <T variant="small" color={p.primary}>{m[0]}</T>
                </View>
                <View>
                  <T variant="small">{m}</T>
                  <T variant="micro" color={p.textFaint}>{mine.length} entries</T>
                </View>
              </Row>
              <T variant="small" color={net >= 0 ? p.ok : p.warn}>{inr(net)}</T>
            </Row>
          );
        })}
      </Card>

      <SectionTitle title="Ledger" icon="document-text" />
      {[...s.ledger].reverse().map((e) => (
        <Card key={e.seq} onPress={() => setDetail(e)} pad={space.md}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={9} style={{ flex: 1 }}>
              <Ionicons
                name={e.payload.kind === 'sale' ? 'trending-up' : e.payload.kind === 'purchase' ? 'cart' : e.payload.kind === 'payout' ? 'cash' : 'add-circle'}
                size={16}
                color={e.payload.amount >= 0 ? p.ok : p.warn}
              />
              <View style={{ flex: 1 }}>
                <T variant="small">{e.payload.note}</T>
                <T variant="micro" color={p.textFaint}>#{e.seq} · {e.payload.member} · {fmtDate(e.ts)} · {e.hash.slice(0, 8)}</T>
              </View>
            </Row>
            <T variant="small" color={e.payload.amount >= 0 ? p.ok : p.warn}>{e.payload.amount >= 0 ? '+' : '−'}{inr(Math.abs(e.payload.amount))}</T>
          </Row>
        </Card>
      ))}

      <Card>
        <SectionTitle title="Post an entry" icon="create" />
        <Row gap={space.sm} wrap>
          <Btn small kind="soft" title="Contribute ₹2,000" icon="add-circle" onPress={() => post('contribution', 2000, 'Member contribution')} />
          <Btn small kind="soft" title="Record sale ₹18,000" icon="trending-up" onPress={() => post('sale', 18000, 'Aggregated lot sold at mandi')} />
          <Btn small kind="ghost" title="Bulk purchase ₹6,400" icon="cart" onPress={() => post('purchase', -6400, 'Collective input purchase')} />
        </Row>
      </Card>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title="Ledger entry">
        {detail ? (
          <View>
            <KV k="Sequence" v={`#${detail.seq}`} />
            <KV k="Member" v={detail.payload.member} />
            <KV k="Kind" v={detail.payload.kind} />
            <KV k="Amount" v={inr(detail.payload.amount)} />
            <KV k="Note" v={detail.payload.note} />
            <KV k="Timestamp" v={new Date(detail.ts).toLocaleString('en-IN')} />
            <Divider />
            <T variant="micro" color={p.textDim}>PREVIOUS HASH</T>
            <T variant="mono" color={p.textFaint}>{detail.prev}</T>
            <T variant="micro" color={p.textDim} style={{ marginTop: 6 }}>ENTRY HASH</T>
            <T variant="mono" color={p.primary}>{detail.hash}</T>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
