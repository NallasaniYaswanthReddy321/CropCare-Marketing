import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Sheet, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { Role, authorize, issueToken } from '../lib/security';
import { uid } from '../lib/crypto';
import { ago } from '../lib/derive';

const SCOPES = [
  { id: 'scan:create', label: 'Take crop scans' },
  { id: 'scan:read', label: 'View scan history' },
  { id: 'irrigation:read', label: 'See irrigation plan' },
  { id: 'market:read', label: 'View prices & mandis' },
  { id: 'order:create', label: 'Sell on marketplace' },
  { id: 'advisor:*', label: 'Use the agronomist' },
  { id: 'twin:*', label: 'Run twin simulations' },
  { id: 'ledger:*', label: 'FPO ledger access' },
  { id: 'credit:accept', label: 'Accept credit offers' },
];

export default function FamilyScreen() {
  const { p } = useTheme();
  const { s, set, audit } = useApp();
  const [edit, setEdit] = React.useState<any>(null);
  const [grantLog, setGrantLog] = React.useState<string[]>([]);

  const toggleScope = (memberId: string, scope: string) => {
    set((d) => ({
      ...d,
      family: d.family.map((m) =>
        m.id === memberId ? { ...m, scopes: m.scopes.includes(scope) ? m.scopes.filter((x) => x !== scope) : [...m.scopes, scope] } : m,
      ),
    }));
    setEdit((prev: any) => prev && ({ ...prev, scopes: prev.scopes.includes(scope) ? prev.scopes.filter((x: string) => x !== scope) : [...prev.scopes, scope] }));
    audit({ actor: s.profile.id, action: 'delegation:update', resource: `member:${memberId}`, outcome: 'allow', meta: { scope } });
  };

  const issueDelegated = (m: any) => {
    const { token, payload } = issueToken(s.security.keys[0], { sub: m.id, role: m.role, scopes: m.scopes, delegatedBy: s.profile.id, farms: ['fld_1'] }, 86400);
    setGrantLog([
      `delegated token issued for ${m.name}`,
      `role=${m.role} scopes=${m.scopes.length} exp=24 h jti=${payload.jti.slice(0, 14)}`,
      `${token.slice(0, 58)}…`,
    ]);
    audit({ actor: s.profile.id, action: 'delegation:issue', resource: `member:${m.id}`, outcome: 'allow' });
  };

  return (
    <Screen>
      <ScreenHeader title="Family & delegation" sub="Give exactly the access you mean to give" icon="people-outline" right={<Pill text={`${s.family.filter((m) => m.active).length} ACTIVE`} color={p.accent} />} />

      <Banner kind="info" icon="key" text="Delegation issues a scoped, signed, 24-hour token — not your password. Revoking a person invalidates their token family instantly on every device that syncs." />

      {s.family.map((m) => (
        <Card key={m.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10} style={{ flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                <T variant="h3" color={p.accent}>{m.name[0]}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="h3">{m.name}</T>
                <T variant="micro" color={p.textDim}>{m.relation} · role “{m.role}” · {m.scopes.length} scopes</T>
              </View>
            </Row>
            <Chip
              label={m.active ? 'Active' : 'Revoked'}
              active={m.active}
              color={m.active ? p.ok : p.danger}
              onPress={() => {
                set((d) => ({ ...d, family: d.family.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)) }));
                audit({ actor: s.profile.id, action: m.active ? 'delegation:revoke' : 'delegation:grant', resource: `member:${m.id}`, outcome: 'allow' });
              }}
            />
          </Row>
          <Row gap={6} wrap style={{ marginTop: space.sm }}>
            {m.scopes.slice(0, 4).map((sc) => <Pill key={sc} text={sc} color={p.textDim} />)}
            {m.scopes.length > 4 ? <Pill text={`+${m.scopes.length - 4}`} color={p.textFaint} /> : null}
          </Row>
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            <Btn small kind="soft" icon="create" title="Edit scopes" style={{ flex: 1 }} onPress={() => setEdit(m)} />
            <Btn small kind="ghost" icon="key" title="Issue token" style={{ flex: 1 }} onPress={() => issueDelegated(m)} />
          </Row>
        </Card>
      ))}

      {grantLog.length ? (
        <Card>
          <SectionTitle title="Last grant" icon="terminal" />
          {grantLog.map((l, i) => <T key={i} variant="mono" color={p.textDim} style={{ marginBottom: 3 }}>{l}</T>)}
        </Card>
      ) : null}

      <Card>
        <Btn
          small
          icon="person-add"
          title="Add family member"
          onPress={() => set((d) => ({ ...d, family: [...d.family, { id: uid('fm'), name: 'New member', relation: 'Family', role: 'family', scopes: ['scan:create', 'market:read'], active: true }] }))}
        />
      </Card>

      <SectionTitle title="Policy preview" icon="shield-checkmark" />
      <Card>
        {s.family.map((m) => {
          const r = authorize({ id: m.id, role: m.role as Role, farmIds: m.active ? ['fld_1'] : [], kycLevel: m.role === 'owner' ? 2 : 0 }, 'credit:accept', { type: 'loan', sensitivity: 'financial' });
          return (
            <Row key={m.id} gap={8} style={{ paddingVertical: 6 }}>
              <Ionicons name={r.allow ? 'checkmark-circle' : 'close-circle'} size={14} color={r.allow ? p.ok : p.danger} />
              <View style={{ flex: 1 }}>
                <T variant="small">{m.name} → accept credit</T>
                <T variant="micro" color={p.textFaint}>{r.reason}</T>
              </View>
            </Row>
          );
        })}
        <Divider />
        <T variant="micro" color={p.textDim}>Financial actions always require KYC level 2 and the owner role, no matter what scopes are granted. Attribute rules cannot be overridden by role alone.</T>
      </Card>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ''}>
        {edit ? (
          <View>
            <KV k="Relation" v={edit.relation} />
            <KV k="Role" v={edit.role} />
            <KV k="Status" v={edit.active ? 'active' : 'revoked'} color={edit.active ? p.ok : p.danger} />
            <Divider />
            <SectionTitle title="Scopes" icon="list" />
            {SCOPES.map((sc) => {
              const on = edit.scopes.includes(sc.id);
              return (
                <Row key={sc.id} style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
                  <View style={{ flex: 1 }}>
                    <T variant="small">{sc.label}</T>
                    <T variant="micro" color={p.textFaint}>{sc.id}</T>
                  </View>
                  <Chip label={on ? 'Granted' : 'Denied'} active={on} color={on ? p.ok : p.textFaint} onPress={() => toggleScope(edit.id, sc.id)} />
                </Row>
              );
            })}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
