import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from './ui';
import { radius, shadow, space, touch, useTheme } from '../lib/theme';

export type MenuItem = {
  icon: string;
  label: string;
  hint?: string;
  onPress: () => void;
  tone?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
  check?: boolean;
};

/**
 * The "⋮" overflow menu used on every screen header.
 * Anchored top-right, full keyboard/screen-reader labels, 48 dp rows.
 */
export function OverflowMenu({ items, label = 'More options' }: { items: MenuItem[]; label?: string }) {
  const { p, elder } = useTheme();
  const [open, setOpen] = React.useState(false);
  const d = touch(elder);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={10}
        style={{ width: d, height: d, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="ellipsis-vertical" size={elder ? 24 : 21} color={p.textDim} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setOpen(false)}>
          <View
            style={{
              position: 'absolute', top: 74, right: 14, minWidth: 250, maxWidth: 320, maxHeight: '74%',
              backgroundColor: p.mode === 'dark' ? p.bgAlt : p.card,
              borderRadius: radius.lg, borderWidth: 1, borderColor: p.glassBorder,
              paddingVertical: space.sm, ...shadow(p, 1.6),
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {items.map((it, i) => {
                const c = it.tone === 'danger' ? p.danger : it.tone === 'primary' ? p.primary : p.text;
                return (
                  <Pressable
                    key={`${it.label}-${i}`}
                    accessibilityRole="menuitem"
                    accessibilityLabel={it.hint ? `${it.label}. ${it.hint}` : it.label}
                    disabled={it.disabled}
                    onPress={() => { setOpen(false); setTimeout(it.onPress, 60); }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingHorizontal: space.lg, paddingVertical: space.md,
                      minHeight: d, opacity: it.disabled ? 0.4 : pressed ? 0.7 : 1,
                      backgroundColor: pressed ? p.surface : 'transparent',
                    })}
                  >
                    <Ionicons name={it.icon as any} size={19} color={c} />
                    <View style={{ flex: 1 }}>
                      <T variant="body" color={c}>{it.label}</T>
                      {it.hint ? <T variant="micro" color={p.textFaint}>{it.hint}</T> : null}
                    </View>
                    {it.check ? <Ionicons name="checkmark" size={17} color={p.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Live connection badge used next to the ⋮ on every screen. */
export function LiveDot({ state, onPress }: { state: string; onPress?: () => void }) {
  const { p } = useTheme();
  const [pulse, setPulse] = React.useState(1);
  React.useEffect(() => {
    if (state !== 'live') return;
    const id = setInterval(() => setPulse((v) => (v === 1 ? 0.45 : 1)), 900);
    return () => clearInterval(id);
  }, [state]);

  const color = state === 'live' ? p.ok : state === 'local' ? p.warn : state === 'backoff' ? p.sun : p.textFaint;
  const text = state === 'live' ? 'LIVE' : state === 'local' ? 'ON DEVICE' : state === 'backoff' ? 'RETRYING' : 'IDLE';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Connection status: ${text}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color + '1E', borderColor: color + '66', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: state === 'live' ? pulse : 1 }} />
      <T variant="micro" color={color}>{text}</T>
    </Pressable>
  );
}
