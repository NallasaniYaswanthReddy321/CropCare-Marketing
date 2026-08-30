import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnswerCard, Banner, BigAction, BigTile, Btn, Card, Chip, Divider, HeroImage, Pill, Row, Screen,
  SectionTitle, Sheet, Skeleton, T,
} from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { activeField, fieldSummary, greeting } from '../lib/derive';
import { CROPS } from '../lib/agro';
import { compareMarkets, inr } from '../lib/price';
import { makeT, voiceLocale } from '../lib/i18n';
import { CROP_IMG, HERO, TILE, avatarFor, wxFor } from '../lib/images';
import { TOOLS, toolByRoute } from '../lib/menu';
import { speak, stopSpeaking } from '../lib/voice';
import { LiveDot, OverflowMenu } from '../components/Menu';
import FarmTwin from '../components/FarmTwin';
import { useRealtime } from '../lib/rtcontext';
import { getFix } from '../lib/geo';

export default function SimpleHomeScreen({ navigation }: any) {
  const { p, elder } = useTheme();
  const { s, set } = useApp();
  const t = makeT(s.profile.lang);
  const [loading, setLoading] = React.useState(true);
  const [pinner, setPinner] = React.useState(false);
  const [geoNote, setGeoNote] = React.useState<string | null>(null);
  const rt = useRealtime();

  const refreshLocation = async () => {
    setGeoNote('Reading GPS…');
    const r = await getFix();
    if (!r.ok) { setGeoNote(r.reason); return; }
    set((d) => ({
      ...d,
      geo: { lat: r.fix.lat, lon: r.fix.lon, district: r.fix.place.d, state: r.fix.place.s, zone: r.fix.place.z, soil: r.fix.place.soil, rain: r.fix.place.rain, source: 'gps', accuracy: r.fix.accuracy, at: Date.now() },
    }));
    setGeoNote(`Updated: ${r.fix.place.d}, ${r.fix.place.s} · ${r.fix.km} km from the district centre.`);
  };

  React.useEffect(() => {
    const id = setTimeout(() => setLoading(false), 420);
    return () => clearTimeout(id);
  }, []);

  const f = activeField(s);
  const sum = React.useMemo(() => fieldSummary(f), [f.id, f.depletionMm]);
  const lastQuality = s.scans.find((x) => x.kind === 'quality');
  const market = React.useMemo(
    () => compareMarkets({
      crop: f.crop, qualityScore: lastQuality?.score ?? 74,
      grade: (lastQuality?.grade as any) ?? 'B', quantityQuintal: 20, vehicleId: 'tempo',
    }),
    [f.crop, lastQuality?.score],
  );
  const outbreaksNear = s.outbreaks.filter((o) => Date.now() - o.at < 5 * 86400000);
  const diseaseNow = React.useMemo(() => {
    const last = s.scans.find((x) => x.kind === 'disease' && x.fieldId === f.id);
    return last ? Math.min(1, last.score / 100) : 0;
  }, [s.scans, f.id]);
  const pending = s.outbox.filter((o) => o.status === 'pending').length;

  /* The single most important sentence on the screen. */
  const water = sum.irr.irrigateNow
    ? { tone: 'warn' as const, headline: `Give water today — ${sum.irr.grossDepthMm} mm`, detail: `That is about ${(sum.irr.litresPerHa * f.areaHa / 1000).toFixed(0)} thousand litres, roughly ${sum.irr.hoursToRun} hours on your ${f.irrigationType}. The soil has used up the easy water.` }
    : { tone: 'ok' as const, headline: 'No water needed today', detail: `Your soil still holds enough. Check again in ${sum.irr.nextCheckDays} day${sum.irr.nextCheckDays > 1 ? 's' : ''}.` };

  const speakSummary = () => {
    const line = `${water.headline}. ${water.detail} Best price today is at ${market[0].mandi.name}, about ${market[0].netPerQ} rupees per quintal after costs. This is an estimate, not a fixed price.`;
    speak(line, voiceLocale(s.profile.lang));
  };

  const pinned = s.settings.pinned.map(toolByRoute).filter(Boolean) as NonNullable<ReturnType<typeof toolByRoute>>[];
  const togglePin = (route: string) =>
    set((d) => ({
      ...d,
      settings: {
        ...d.settings,
        pinned: d.settings.pinned.includes(route)
          ? d.settings.pinned.filter((x) => x !== route)
          : [...d.settings.pinned, route],
      },
    }));

  if (loading) {
    return (
      <Screen>
        <Skeleton h={64} />
        <Skeleton h={170} />
        <Skeleton h={120} />
        <Row gap={space.sm}><Skeleton h={150} style={{ flex: 1 }} /><Skeleton h={150} style={{ flex: 1 }} /></Row>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* greeting */}
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <Row gap={10} style={{ flex: 1 }}>
          <Image source={avatarFor(s.profile.name)} style={{ width: 46, height: 46, borderRadius: 23 }} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <T variant="small" color={p.textDim}>{t(greeting())}</T>
            <T variant="h2" numberOfLines={1}>{s.profile.name.split(' ')[0]}</T>
          </View>
        </Row>
        <Row gap={6}>
          <LiveDot state={rt.state} onPress={() => navigation.navigate('Live')} />
          <OverflowMenu
            items={[
              { icon: 'pulse', label: 'Live now', hint: 'Everything happening right now', onPress: () => navigation.navigate('Live'), tone: 'primary' },
              { icon: 'navigate', label: 'Update my location', hint: s.geo ? `${s.geo.district}, ${s.geo.state}` : 'Not set yet', onPress: refreshLocation },
              { icon: 'add-circle', label: 'Add a field', onPress: () => navigation.navigate('AddField') },
              { icon: 'apps', label: 'Choose home tools', onPress: () => setPinner(true) },
              { icon: 'stats-chart', label: 'Expert dashboard', hint: 'Every number behind the advice', onPress: () => navigation.navigate('Dashboard') },
              { icon: 'language', label: 'Change language', hint: 'Nine languages, switches everything', onPress: () => navigation.navigate('Settings') },
              { icon: 'text', label: 'Bigger text', check: s.settings.elder, onPress: () => set((d) => ({ ...d, settings: { ...d.settings, elder: !d.settings.elder } })) },
              { icon: s.settings.theme === 'dark' ? 'sunny' : 'moon', label: s.settings.theme === 'dark' ? 'Day colours' : 'Night colours', onPress: () => set((d) => ({ ...d, settings: { ...d.settings, theme: d.settings.theme === 'dark' ? 'light' : 'dark' } })) },
              { icon: 'airplane', label: 'Airplane mode', hint: 'Prove it works with no signal', check: s.settings.airplane, onPress: () => set((d) => ({ ...d, settings: { ...d.settings, airplane: !d.settings.airplane } })) },
              { icon: 'settings', label: 'All settings', onPress: () => navigation.navigate('Settings') },
            ]}
          />
        </Row>
      </Row>

      {geoNote ? <Banner kind={geoNote.startsWith('Updated') ? 'ok' : 'warn'} icon="location" text={geoNote} /> : null}

      {/* today's field */}
      {/* the living picture of this field, right now */}
      <Card pad={space.sm} onPress={() => navigation.navigate('Twin')}>
        <FarmTwin
          crop={f.crop}
          cc={Math.max(0.12, sum.ph.pct * 0.95)}
          ks={sum.irr.stress > 0 ? 1 - sum.irr.stress : 1}
          maturity={sum.ph.pct}
          stage={sum.ph.series[sum.ph.series.length - 1]?.stage ?? 'Growing'}
          depletionMm={sum.irr.depletion}
          tawMm={sum.irr.taw}
          rawMm={sum.irr.raw}
          rainMm={sum.weather[0].rainMm}
          tMaxC={sum.weather[0].tMax}
          rhPct={sum.weather[0].rhMean}
          windMs={sum.weather[0].windMs}
          disease={diseaseNow}
          rootDepthM={CROPS[f.crop].rootDepth}
          seed={f.id}
          height={elder ? 250 : 220}
          showSoil
        />
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="h3">{CROPS[f.crop].name} · {f.name}</T>
            <T variant="micro" color={p.textDim}>
              Day {sum.das} · {sum.ph.series[sum.ph.series.length - 1]?.stage ?? 'Growing'} · {f.areaHa} ha · tap to explore
            </T>
          </View>
          <Pill text={`${(f.ndvi[f.ndvi.length - 1] * 100).toFixed(0)} GREEN`} color={p.primary} icon="leaf" />
        </Row>
      </Card>

      {/* THE answer */}
      <AnswerCard
        tone={water.tone}
        headline={water.headline}
        detail={water.detail}
        image={TILE.water}
        onSpeak={speakSummary}
        action={
          <Row gap={space.sm}>
            <Btn title="Open water plan" icon="water" style={{ flex: 1 }} onPress={() => navigation.navigate('Irrigation')} />
            <Btn title="Stop voice" kind="ghost" icon="stop-circle" small onPress={stopSpeaking} />
          </Row>
        }
      />

      {/* four giant actions */}
      <Card pad={space.lg}>
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <BigAction icon="camera" label="Check crop" color={p.primary} onPress={() => navigation.navigate('Scan')} />
          <BigAction icon="pricetag" label="Best price" color={p.accent} onPress={() => navigation.navigate('Market')} />
          <BigAction icon="map" label="Field map" color={p.water} onPress={() => navigation.navigate('FieldMap')} />
          <BigAction icon="megaphone" label="Village" color={p.sun} badge={outbreaksNear.length || undefined} onPress={() => navigation.navigate('Outbreak')} />
        </Row>
      </Card>

      {/* price answer */}
      <AnswerCard
        tone="info"
        headline={`Best price: ${market[0].mandi.name}`}
        detail={`About ${inr(market[0].netPerQ)} per quintal in your hand, after ${inr(market[0].transport)} transport and ${market[0].lossPct}% spoilage on the way. This is an AI estimate — a range, not a promise.`}
        image={TILE.price}
        onSpeak={() => speak(`Best price today is ${market[0].mandi.name}, about ${market[0].netPerQ} rupees per quintal after costs. This is an estimate.`, voiceLocale(s.profile.lang))}
        action={<Btn title="Compare all markets" icon="git-compare" onPress={() => navigation.navigate('Market')} />}
      />

      {/* weather strip with pictures */}
      <SectionTitle title="Next 5 days" icon="partly-sunny" right={<Pressable onPress={() => navigation.navigate('Mesh')}><T variant="micro" color={p.primary}>VILLAGE WEATHER →</T></Pressable>} />
      <Card pad={space.md}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {sum.weather.slice(0, 5).map((w, i) => (
            <View key={w.date} style={{ alignItems: 'center', backgroundColor: p.surface, borderRadius: radius.md, padding: 10, minWidth: 86, borderWidth: 1, borderColor: p.glassBorder }}>
              <T variant="micro" color={p.textDim}>{i === 0 ? 'TODAY' : new Date(w.date).toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()}</T>
              <Image source={wxFor(w.rainMm, w.windMs)} style={{ width: 46, height: 46, marginVertical: 4 }} contentFit="contain" />
              <T variant="h3">{Math.round(w.tMax)}°</T>
              <T variant="micro" color={p.textFaint}>{w.rainMm > 0 ? `${w.rainMm} mm rain` : 'no rain'}</T>
            </View>
          ))}
        </ScrollView>
      </Card>

      {/* my fields with crop pictures */}
      <SectionTitle title="My fields" icon="map" right={<Pressable onPress={() => navigation.navigate('AddField')}><T variant="micro" color={p.primary}>+ ADD FIELD</T></Pressable>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: space.md }}>
        {s.fields.map((fl) => {
          const on = fl.id === s.activeFieldId;
          return (
            <Pressable
              key={fl.id}
              onPress={() => set((d) => ({ ...d, activeFieldId: fl.id }))}
              accessibilityLabel={`Select ${fl.name}`}
              style={{ width: 150, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: p.card, borderWidth: on ? 2.5 : 1, borderColor: on ? p.primary : p.glassBorder }}
            >
              <Image source={CROP_IMG[fl.crop]} style={{ width: '100%', height: 92 }} contentFit="cover" />
              <View style={{ padding: 10 }}>
                <T variant="h3" numberOfLines={1}>{fl.name}</T>
                <T variant="micro" color={p.textDim}>{CROPS[fl.crop].name} · {fl.areaHa} ha</T>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => navigation.navigate('AddField')}
          style={{ width: 150, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.primary + '88', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: p.primary + '10' }}
        >
          <Ionicons name="add-circle" size={30} color={p.primary} />
          <T variant="small" color={p.primary}>Add a field</T>
        </Pressable>
      </ScrollView>

      {/* farmer-pinned tools */}
      <SectionTitle
        title="My tools"
        icon="apps"
        right={<Pressable onPress={() => setPinner(true)}><T variant="micro" color={p.primary}>+ ADD TOOL</T></Pressable>}
      />
      <Row gap={space.sm} wrap>
        {pinned.map((tool) => (
          <BigTile
            key={tool.route}
            image={TILE[tool.tile]}
            label={tool.simple}
            hint={tool.hint}
            onPress={() => navigation.navigate(tool.route)}
          />
        ))}
        <Pressable
          onPress={() => setPinner(true)}
          style={{ width: '48%', minHeight: 150, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.primary + '88', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: p.primary + '0E', marginBottom: space.md }}
        >
          <Ionicons name="add-circle" size={32} color={p.primary} />
          <T variant="small" color={p.primary}>Add a tool</T>
          <T variant="micro" color={p.textFaint} center style={{ paddingHorizontal: 12 }}>Choose what you use most</T>
        </Pressable>
      </Row>

      {/* help + sync */}
      <Card onPress={() => navigation.navigate('Channels')} pad={0} style={{ overflow: 'hidden' }}>
        <Image source={HERO.help} style={{ width: '100%', height: 130 }} contentFit="cover" />
        <View style={{ padding: space.lg }}>
          <T variant="h3">No internet? No smartphone?</T>
          <T variant="small" color={p.textDim}>Everything here works offline. Family can also get the same advice by SMS, a missed call or WhatsApp.</T>
        </View>
      </Card>

      <Card onPress={() => navigation.navigate('Mesh')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={10} style={{ flex: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.water + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="git-network" size={19} color={p.water} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">{pending} things waiting to send</T>
              <T variant="small" color={p.textDim}>They will go out by themselves when any phone in the village finds signal.</T>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
        </Row>
      </Card>

      <Pressable onPress={() => navigation.navigate('Dashboard')} style={{ alignItems: 'center', paddingVertical: space.md }}>
        <Row gap={6}>
          <Ionicons name="stats-chart" size={15} color={p.textDim} />
          <T variant="small" color={p.textDim}>Show me all the numbers (expert view)</T>
        </Row>
      </Pressable>

      {/* tool picker */}
      <Sheet visible={pinner} onClose={() => setPinner(false)} title="Add tools to your home">
        <T variant="small" color={p.textDim} style={{ marginBottom: space.md }}>
          Tap any tool to put it on your home screen. Tap again to remove it. Your choice is saved on this phone.
        </T>
        {(['field', 'money', 'village', 'trust'] as const).map((g) => (
          <View key={g}>
            <SectionTitle title={g === 'field' ? 'My field' : g === 'money' ? 'My money' : g === 'village' ? 'My village' : 'Trust'} icon="chevron-forward" />
            {TOOLS.filter((x) => x.group === g && x.pinnable).map((tool) => {
              const on = s.settings.pinned.includes(tool.route);
              return (
                <Pressable
                  key={tool.route}
                  onPress={() => togglePin(tool.route)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: on ? p.primary : p.glassBorder, backgroundColor: on ? p.primary + '12' : 'transparent', marginBottom: space.sm }}
                >
                  <Image source={TILE[tool.tile]} style={{ width: 54, height: 54, borderRadius: radius.sm }} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <T variant="h3">{tool.simple}</T>
                    <T variant="micro" color={p.textDim}>{tool.hint}</T>
                    <T variant="micro" color={p.textFaint}>{tool.expert}</T>
                  </View>
                  <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={on ? p.primary : p.textFaint} />
                </Pressable>
              );
            })}
          </View>
        ))}
        <Divider />
        <Btn title="Done" icon="checkmark" onPress={() => setPinner(false)} />
      </Sheet>
    </Screen>
  );
}
