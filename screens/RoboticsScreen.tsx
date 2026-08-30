import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Stat, T } from '../components/ui';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField, fieldIrrigation } from '../lib/derive';
import { signWebhook, verifyWebhook } from '../lib/security';
import { uid } from '../lib/crypto';

type Task = { id: string; topic: string; payload: any; state: 'queued' | 'running' | 'done'; at: number };

export default function RoboticsScreen() {
  const { p } = useTheme();
  const { s, set, audit } = useApp();
  const f = activeField(s);
  const irr = React.useMemo(() => fieldIrrigation(f), [f.id]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    setTasks((prev) => prev.map((x) => (x.state === 'queued' ? { ...x, state: 'running' } : x.state === 'running' ? { ...x, state: 'done' } : x)));
  }, [tick]);

  const devices = [
    { id: 'valve_north', name: 'Solenoid valve — north block', type: 'actuator', online: true, battery: 0.74, topic: 'farm/fld_1/valve/north' },
    { id: 'soil_1', name: 'Capacitive soil probe (30 cm)', type: 'sensor', online: true, battery: 0.52, topic: 'farm/fld_1/soil/1' },
    { id: 'rover_1', name: 'Scouting rover', type: 'robot', online: false, battery: 0.18, topic: 'farm/fld_1/rover/1' },
    { id: 'weather_1', name: 'Mesh weather node', type: 'sensor', online: true, battery: 0.91, topic: 'village/shirur/weather/1' },
  ];

  const telemetry = [
    { k: 'soil_vwc_30cm', v: `${(0.26 - irr.depletion / 1000).toFixed(3)} m³/m³`, ok: true },
    { k: 'valve_state', v: irr.irrigateNow ? 'OPEN (scheduled)' : 'CLOSED', ok: true },
    { k: 'flow_lpm', v: irr.irrigateNow ? '198.4' : '0.0', ok: true },
    { k: 'battery_rover', v: '18% — below 20% threshold', ok: false },
    { k: 'last_heartbeat', v: `${tick % 5}s ago`, ok: true },
  ];

  const publish = (topic: string, payload: any) => {
    const t: Task = { id: uid('task'), topic, payload, state: 'queued', at: Date.now() };
    setTasks((prev) => [t, ...prev].slice(0, 8));
    audit({ actor: s.profile.id, action: 'task:publish', resource: topic, outcome: 'allow', meta: payload });
  };

  const body = JSON.stringify({ task: 'irrigate', mm: irr.grossDepthMm, field: f.id });
  const sig = signWebhook('whsec_robot_bus', body);
  const verified = verifyWebhook('whsec_robot_bus', body, sig.header);

  return (
    <Screen>
      <ScreenHeader title="Robotics & IoT" sub="MQTT task API for valves, probes and rovers" icon="hardware-chip" right={<Pill text={s.settings.robotics ? 'BUS ONLINE' : 'BUS OFF'} color={s.settings.robotics ? p.ok : p.textFaint} />} />

      <Row gap={space.sm} style={{ marginBottom: space.md }}>
        <Stat label="Devices" value={`${devices.filter((d) => d.online).length}/${devices.length}`} sub="online" color={p.ok} icon="wifi" />
        <Stat label="Broker" value="local" sub="mosquitto on edge box" color={p.water} icon="server" />
        <Stat label="QoS" value="1" sub="at-least-once + idempotency" color={p.textDim} icon="git-commit" />
      </Row>

      <SectionTitle title="Devices" icon="git-network" />
      {devices.map((d) => (
        <Card key={d.id} pad={space.md}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={10} style={{ flex: 1 }}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: (d.online ? p.ok : p.textFaint) + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={d.type === 'robot' ? 'car' : d.type === 'sensor' ? 'thermometer' : 'water'} size={16} color={d.online ? p.ok : p.textFaint} />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="small">{d.name}</T>
                <T variant="mono" color={p.textFaint}>{d.topic}</T>
              </View>
            </Row>
            <View style={{ alignItems: 'flex-end', width: 78 }}>
              <T variant="micro" color={d.battery < 0.25 ? p.danger : p.textDim}>{(d.battery * 100).toFixed(0)}%</T>
              <Bar value={d.battery} color={d.battery < 0.25 ? p.danger : p.ok} height={4} />
            </View>
          </Row>
        </Card>
      ))}

      <SectionTitle title="Publish a task" icon="send" />
      <Card>
        <Row gap={8} wrap>
          <Btn small kind="soft" icon="water" title={`Irrigate ${irr.grossDepthMm} mm`} onPress={() => publish('farm/fld_1/valve/north/cmd', { action: 'open', mm: irr.grossDepthMm, minutes: Math.round(irr.hoursToRun * 60) })} />
          <Btn small kind="soft" icon="stop-circle" title="Close valve" onPress={() => publish('farm/fld_1/valve/north/cmd', { action: 'close' })} />
          <Btn small kind="soft" icon="camera" title="Rover scout run" onPress={() => publish('farm/fld_1/rover/1/cmd', { action: 'patrol', waypoints: 6, capture: 'rgb+ndvi' })} />
          <Btn small kind="ghost" icon="refresh" title="Request telemetry" onPress={() => publish('farm/fld_1/+/telemetry/req', { since: 'now-1h' })} />
        </Row>
        {tasks.length ? <Divider /> : null}
        {tasks.map((t) => (
          <Row key={t.id} style={{ justifyContent: 'space-between', paddingVertical: 5 }}>
            <Row gap={8} style={{ flex: 1 }}>
              <Ionicons name={t.state === 'done' ? 'checkmark-circle' : t.state === 'running' ? 'sync' : 'hourglass'} size={14} color={t.state === 'done' ? p.ok : p.warn} />
              <T variant="mono" color={p.textDim} numberOfLines={1}>{t.topic}</T>
            </Row>
            <T variant="micro" color={p.textFaint}>{t.state}</T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Live telemetry" icon="pulse" />
      <Card>
        {telemetry.map((t) => (
          <Row key={t.k} style={{ justifyContent: 'space-between', paddingVertical: 5 }}>
            <T variant="mono" color={p.textDim}>{t.k}</T>
            <T variant="small" color={t.ok ? p.text : p.danger}>{t.v}</T>
          </Row>
        ))}
      </Card>

      <SectionTitle title="API contract" icon="code-slash" />
      <Card>
        <T variant="mono" color={p.textDim} style={{ lineHeight: 18 }}>
          {`POST /api/v1/robotics/tasks
Authorization: Bearer <EdDSA token, scope task:write>
X-Idempotency-Key: <uuid>
X-Signature: ${sig.header.slice(0, 34)}…

{
  "topic": "farm/fld_1/valve/north/cmd",
  "payload": { "action": "open", "mm": ${irr.grossDepthMm} },
  "qos": 1,
  "expires_in": 900
}`}
        </T>
        <Divider />
        <KV k="Signature verification" v={verified.ok ? 'valid (constant-time compare)' : verified.reason} color={verified.ok ? p.ok : p.danger} />
        <KV k="Replay protection" v="timestamp + 300 s tolerance" />
        <KV k="Authorisation" v="role=robot may write telemetry and read tasks only" />
        <KV k="Safety interlock" v="Valve commands expire in 15 min and auto-close on lost heartbeat" />
      </Card>

      <Banner kind="warn" icon="shield" text="Actuator commands are the highest-risk surface in a farm deployment. They require a scoped token, an idempotency key, an HMAC signature and a dead-man heartbeat — a stolen phone cannot flood a field." />
    </Screen>
  );
}
