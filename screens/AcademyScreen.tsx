import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Banner, Bar, Btn, Card, Chip, Divider, KV, Pill, Row, Screen, ScreenHeader, SectionTitle, Sheet, T } from '../components/ui';
import { TILE } from '../lib/images';
import { space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';

const COVER: Record<string, any> = {
  Water: TILE.water, Market: TILE.market, Protection: TILE.doctor, Money: TILE.money, Storage: TILE.price,
};

type Lesson = {
  id: string; title: string; mins: number; track: string; body: string[];
  quiz: { q: string; options: string[]; answer: number; why: string };
};

const LESSONS: Lesson[] = [
  {
    id: 'l_water', title: 'Reading soil moisture with your hand', mins: 4, track: 'Water',
    body: [
      'Dig 15 cm down in three spots across the field and squeeze a handful of soil.',
      'If it forms a ball that holds together and leaves a wet outline on your palm, the root zone is near field capacity — do not irrigate.',
      'If the ball crumbles when you poke it, you are roughly at 50% depletion. On sandy soil that is already irrigation time; on clay you still have a day or two.',
      'If the soil will not hold shape at all, you are past readily available water and the crop is losing yield right now.',
    ],
    quiz: { q: 'The soil ball crumbles when poked. Your soil is sandy. What do you do?', options: ['Wait two more days', 'Irrigate today', 'Only irrigate if leaves wilt'], answer: 1, why: 'Sandy soils hold little water, so RAW is exhausted quickly. Waiting for visible wilting means the yield loss has already happened.' },
  },
  {
    id: 'l_grade', title: 'Grading before you sell', mins: 3, track: 'Market',
    body: [
      'Buyers price a lot to the worst unit they can see. One rotten fruit on top can cut the price of the whole crate.',
      'Sort into three grades on a clean sheet: uniform and unblemished (A), minor blemish or size variation (B), damaged or over-ripe (C).',
      'Sell grades separately. Mixing to raise weight nearly always loses money.',
      'Photograph each grade with CropCare before loading — the score and the passport travel with the lot.',
    ],
    quiz: { q: 'You have 20 quintals with about 8% visibly blemished fruit. What earns the most?', options: ['Sell everything mixed', 'Remove the 8% and sell A/B separately', 'Hold everything for 5 days'], answer: 1, why: 'Removing the visibly damaged fraction typically lifts the lot price 6–11%, which more than pays for the sorting labour.' },
  },
  {
    id: 'l_spray', title: 'Spraying so it actually works', mins: 5, track: 'Protection',
    body: [
      'Spray in still air, early morning or late evening. Above 4.5 m/s wind, most of your money drifts onto the road.',
      'Calibrate: walk a measured 50 m, catch the output and measure it. Guessing the dose is the most common reason a spray "fails".',
      'Rotate IRAC / FRAC groups between pest generations. Repeating the same mode of action breeds resistance in your own field.',
      'Add a sticker only when the label permits it, and never tank-mix two products from the same group.',
    ],
    quiz: { q: 'You sprayed IRAC group 4A twelve days ago and whitefly is back. What next?', options: ['Spray 4A again at double dose', 'Switch to a different IRAC group', 'Wait until the pest population doubles'], answer: 1, why: 'Repeating the same mode of action within one generation selects hard for resistant survivors. Rotate the group instead.' },
  },
  {
    id: 'l_credit', title: 'Borrowing without losing the farm', mins: 4, track: 'Money',
    body: [
      'Compare the total cost of credit, not the monthly instalment. A 2% monthly "flat" rate is about 44% a year on a reducing basis.',
      'Match the tenure to the cash-flow event that repays it — a 6-month crop loan repaid at harvest, not a 24-month loan for a 4-month crop.',
      'Keep every sale receipt in the passport. Verified receipts are what lifts your FarmScore and cuts your interest rate.',
      'Never borrow to cover an old loan instalment. Restructure openly instead.',
    ],
    quiz: { q: 'A trader offers 2% per month "flat" on ₹40,000 for 12 months. The effective annual rate is closest to:', options: ['24%', '44%', '12%'], answer: 1, why: 'Flat interest is charged on the full principal while you repay it, so the effective reducing-balance rate is roughly double the flat rate.' },
  },
  {
    id: 'l_store', title: 'Post-harvest: the cheapest yield gain', mins: 3, track: 'Storage',
    body: [
      'Harvest in the cool hours and get produce out of the sun within two hours. Field heat is the single biggest shelf-life thief.',
      'Pre-cool with shade, water evaporation or forced air before packing tightly.',
      'Never store ethylene producers (banana, tomato) with ethylene-sensitive crops (leafy greens).',
      'Onion wants 65–70% humidity, potato wants 90–95%. One room cannot serve both.',
    ],
    quiz: { q: 'Why should banana never share a store with spinach?', options: ['Banana absorbs moisture', 'Banana releases ethylene, which ages leafy greens', 'Spinach is colder'], answer: 1, why: 'Ethylene from ripening banana accelerates senescence and yellowing in leafy vegetables.' },
  },
];

export default function AcademyScreen() {
  const { p } = useTheme();
  const { s, set, audit } = useApp();
  const [open, setOpen] = React.useState<Lesson | null>(null);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [track, setTrack] = React.useState('All');

  const tracks = ['All', ...Array.from(new Set(LESSONS.map((l) => l.track)))];
  const list = track === 'All' ? LESSONS : LESSONS.filter((l) => l.track === track);
  const done = Object.values(s.academy).filter((x) => x.done).length;

  const finish = (l: Lesson, correct: boolean) => {
    set((d) => ({ ...d, academy: { ...d.academy, [l.id]: { done: true, score: correct ? 100 : 60 } } }));
    audit({ actor: s.profile.id, action: 'academy:complete', resource: `lesson:${l.id}`, outcome: 'info', meta: { correct } });
  };

  return (
    <Screen>
      <ScreenHeader title="Academy" sub="Five-minute lessons that pay for themselves" icon="school" right={<Pill text={`${done}/${LESSONS.length} DONE`} color={p.sun} />} />

      <Card>
        <Bar value={done} max={LESSONS.length} color={p.sun} height={9} label={`Progress ${Math.round((done / LESSONS.length) * 100)}%`} />
        <T variant="micro" color={p.textFaint} style={{ marginTop: 6 }}>Completing the Money and Protection tracks adds up to 25 points to your FarmScore behaviour factor.</T>
      </Card>

      <Row gap={8} wrap style={{ marginBottom: space.md }}>
        {tracks.map((tr) => <Chip key={tr} label={tr} active={track === tr} onPress={() => setTrack(tr)} />)}
      </Row>

      {list.map((l) => {
        const prog = s.academy[l.id];
        return (
          <Card key={l.id} onPress={() => { setOpen(l); setPicked(null); }} pad={space.md}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={12} style={{ flex: 1 }}>
                <View>
                  <Image source={COVER[l.track] ?? TILE.learn} style={{ width: 74, height: 74, borderRadius: 16 }} contentFit="cover" />
                  {prog?.done ? (
                    <View style={{ position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: p.ok, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={15} color="#fff" />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <T variant="h3">{l.title}</T>
                  <T variant="micro" color={p.textDim}>{l.track} · {l.mins} min · {prog?.done ? `scored ${prog.score}%` : 'not started'}</T>
                </View>
              </Row>
              <Ionicons name="chevron-forward" size={17} color={p.textFaint} />
            </Row>
          </Card>
        );
      })}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open ? (
          <View>
            <Image source={COVER[open.track] ?? TILE.learn} style={{ width: '100%', height: 130, borderRadius: 18, marginBottom: space.md }} contentFit="cover" />
            <Row gap={8} style={{ marginBottom: space.md }}>
              <Pill text={open.track.toUpperCase()} color={p.sun} />
              <Pill text={`${open.mins} MIN`} color={p.textDim} icon="time" />
              <Btn small kind="ghost" icon="volume-high" title="Listen" onPress={() => speak(open.body.join(' '), voiceLocale(s.profile.lang))} />
            </Row>
            {open.body.map((b, i) => (
              <Row key={i} gap={9} style={{ marginBottom: 10, alignItems: 'flex-start' }}>
                <T variant="h3" color={p.sun}>{i + 1}</T>
                <T variant="small" style={{ flex: 1, lineHeight: 21 }}>{b}</T>
              </Row>
            ))}
            <Divider />
            <SectionTitle title="Check yourself" icon="help-circle" />
            <T variant="small" style={{ marginBottom: space.sm }}>{open.quiz.q}</T>
            {open.quiz.options.map((o, i) => (
              <Btn
                key={o}
                kind={picked === null ? 'soft' : i === open.quiz.answer ? 'primary' : picked === i ? 'danger' : 'ghost'}
                title={o}
                small
                style={{ marginBottom: 8 }}
                onPress={() => { if (picked === null) { setPicked(i); finish(open, i === open.quiz.answer); } }}
              />
            ))}
            {picked !== null ? (
              <Banner kind={picked === open.quiz.answer ? 'ok' : 'warn'} icon="bulb" text={open.quiz.why} />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
