import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BigTile, Btn, Card, Chip, Field, HeroImage, Pill, Row, Screen, ScreenHeader, SectionTitle, T } from '../components/ui';
import { radius, space, useTheme } from '../lib/theme';
import { useApp } from '../lib/store';
import { GROUP_LABEL, TOOLS, Tool } from '../lib/menu';
import { TILE, HERO } from '../lib/images';
import { speak } from '../lib/voice';
import { voiceLocale } from '../lib/i18n';

export default function HubScreen({ navigation }: any) {
  const { p } = useTheme();
  const { s, set } = useApp();
  const simple = s.settings.simple;
  const [q, setQ] = React.useState('');

  const matches = (t: Tool) =>
    !q.trim() ||
    `${t.simple} ${t.expert} ${t.hint}`.toLowerCase().includes(q.trim().toLowerCase());

  const groups: Tool['group'][] = ['field', 'money', 'village', 'trust'];
  const pinned = s.settings.pinned;

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

  return (
    <Screen>
      <ScreenHeader
        title={simple ? 'All tools' : 'All modules'}
        sub={simple ? 'Everything works without internet. Tap the star to keep a tool on your home screen.' : `${TOOLS.length} modules · offline-first`}
        icon="apps"
        right={<Pill text={simple ? 'SIMPLE' : 'EXPERT'} color={p.primary} icon={simple ? 'happy' : 'construct'} />}
      />

      <Card pad={space.md}>
        <Field value={q} onChangeText={setQ} placeholder={simple ? 'Search: water, price, seed…' : 'Search modules'} icon="search" />
        <Row gap={8} style={{ marginTop: space.sm }} wrap>
          <Chip
            label={simple ? 'Simple words' : 'Technical names'}
            icon={simple ? 'happy-outline' : 'construct-outline'}
            active
            onPress={() => set((d) => ({ ...d, settings: { ...d.settings, simple: !d.settings.simple } }))}
          />
          <Chip label="Bigger text" icon="text" active={s.settings.elder} onPress={() => set((d) => ({ ...d, settings: { ...d.settings, elder: !d.settings.elder } }))} />
          <Chip label={s.settings.theme === 'dark' ? 'Night' : 'Day'} icon={s.settings.theme === 'dark' ? 'moon' : 'sunny'} active onPress={() => set((d) => ({ ...d, settings: { ...d.settings, theme: d.settings.theme === 'dark' ? 'light' : 'dark' } }))} />
        </Row>
      </Card>

      {groups.map((g) => {
        const items = TOOLS.filter((t) => t.group === g && matches(t));
        if (!items.length) return null;
        const label = GROUP_LABEL[g];
        return (
          <View key={g}>
            <SectionTitle title={simple ? label.simple : label.expert} icon={label.icon} />
            {items.map((tool) => {
              const on = pinned.includes(tool.route);
              return (
                <Card key={tool.route} pad={0} style={{ overflow: 'hidden' }}>
                  <Pressable
                    onPress={() => navigation.navigate(tool.route)}
                    accessibilityRole="button"
                    accessibilityLabel={`${simple ? tool.simple : tool.expert}. ${tool.hint}`}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, opacity: pressed ? 0.8 : 1 })}
                  >
                    <Image source={TILE[tool.tile]} style={{ width: 68, height: 68, borderRadius: radius.md }} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <T variant="h3">{simple ? tool.simple : tool.expert}</T>
                      <T variant="small" color={p.textDim} numberOfLines={2}>{tool.hint}</T>
                      {simple ? <T variant="micro" color={p.textFaint}>{tool.expert}</T> : null}
                    </View>
                    {tool.pinnable ? (
                      <Pressable onPress={() => togglePin(tool.route)} hitSlop={12} accessibilityLabel={on ? 'Remove from home' : 'Add to home'}>
                        <Ionicons name={on ? 'star' : 'star-outline'} size={24} color={on ? p.sun : p.textFaint} />
                      </Pressable>
                    ) : null}
                    <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
                  </Pressable>
                </Card>
              );
            })}
          </View>
        );
      })}

      <HeroImage
        source={HERO.help}
        title="Need a person, not an app?"
        sub="Ask the village agronomist or your FPO — in your language, encrypted."
        height={140}
        onPress={() => navigation.navigate('SecureChat')}
      />

      <Card>
        <Row gap={10}>
          <Ionicons name="volume-high" size={20} color={p.primary} />
          <View style={{ flex: 1 }}>
            <T variant="h3">Read this screen aloud</T>
            <T variant="small" color={p.textDim}>Elder mode reads every card in your language.</T>
          </View>
          <Btn
            small
            title="Listen"
            icon="play"
            onPress={() =>
              speak(
                TOOLS.filter((t) => pinned.includes(t.route)).map((t) => `${t.simple}. ${t.hint}.`).join(' ') ||
                  'You have not pinned any tools yet. Tap the star next to a tool to keep it on your home screen.',
                voiceLocale(s.profile.lang),
              )
            }
          />
        </Row>
      </Card>

      <Card>
        <T variant="small" color={p.textDim}>
          CropCare runs on a 100% free and open-source stack: Expo/React Native, Flask, SQLite/SQLCipher, on-device
          computer vision, Ollama, Whisper.cpp and Piper. A whole village can run it from one phone and one edge box.
        </T>
      </Card>
    </Screen>
  );
}
