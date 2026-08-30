import React from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TextStyle, View, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGrad, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Palette, font, radius, scaleFont, shadow, space, touch, useTheme } from '../lib/theme';

/* --------------------------------- text ---------------------------------- */
export const T = ({ style, variant = 'body', color, children, numberOfLines, center }: {
  style?: any; variant?: keyof typeof font; color?: string; children: React.ReactNode;
  numberOfLines?: number; center?: boolean;
}) => {
  const { p, elder } = useTheme();
  const base: any = font[variant];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[scaleFont(base, elder), { color: color ?? p.text }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
};

/* -------------------------------- screen --------------------------------- */
export function Screen({ children, scroll = true, padded = true, footer }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; footer?: React.ReactNode;
}) {
  const { p } = useTheme();
  const Body: any = scroll ? ScrollView : View;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <LinearGradient colors={p.gradient} style={StyleSheet.absoluteFill as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Body
          {...(scroll
            ? { contentContainerStyle: { padding: padded ? space.lg : 0, paddingBottom: 130 }, showsVerticalScrollIndicator: false }
            : { style: { flex: 1, padding: padded ? space.lg : 0 } })}
        >
          {children}
        </Body>
        {footer}
      </SafeAreaView>
    </View>
  );
}

/* --------------------------------- card ---------------------------------- */
export function Card({ children, style, onPress, glow, pad = space.lg }: {
  children: React.ReactNode; style?: any; onPress?: () => void; glow?: boolean; pad?: number;
}) {
  const { p } = useTheme();
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      style={({ pressed }: any) => [
        {
          backgroundColor: p.mode === 'dark' ? p.glass : p.card,
          borderColor: glow ? p.primary + '88' : p.glassBorder,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: pad,
          marginBottom: space.md,
          ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px)' } as any) : null),
          ...shadow(p, glow ? 1.4 : 0.8),
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {children}
    </Wrap>
  );
}

export function SectionTitle({ title, right, icon }: { title: string; right?: React.ReactNode; icon?: any }) {
  const { p } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm, marginTop: space.xs, gap: 8 }}>
      {icon ? <Ionicons name={icon} size={16} color={p.primary} /> : null}
      <T variant="micro" color={p.textDim} style={{ textTransform: 'uppercase', flex: 1 }}>{title}</T>
      {right}
    </View>
  );
}

/* -------------------------------- button --------------------------------- */
export function Btn({ title, onPress, icon, kind = 'primary', small, disabled, style, loading }: {
  title: string; onPress?: () => void; icon?: any; kind?: 'primary' | 'ghost' | 'danger' | 'soft'; small?: boolean;
  disabled?: boolean; style?: any; loading?: boolean;
}) {
  const { p } = useTheme();
  const bg = kind === 'primary' ? p.primary : kind === 'danger' ? p.danger : kind === 'soft' ? p.surfaceStrong : 'transparent';
  const fg = kind === 'primary' ? p.onPrimary : kind === 'danger' ? '#fff' : p.text;
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [{
        backgroundColor: bg,
        borderWidth: kind === 'ghost' ? 1 : 0,
        borderColor: p.glassBorder,
        paddingVertical: small ? 9 : 13,
        paddingHorizontal: small ? 12 : 18,
        borderRadius: radius.pill,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 15 : 17} color={fg} /> : null}
      <T variant={small ? 'small' : 'h3'} color={fg}>{title}</T>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color, icon }: { label: string; active?: boolean; onPress?: () => void; color?: string; icon?: any }) {
  const { p } = useTheme();
  const c = color ?? p.primary;
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill,
        backgroundColor: active ? c + '28' : p.surface,
        borderWidth: 1, borderColor: active ? c : p.glassBorder,
        flexDirection: 'row', alignItems: 'center', gap: 6,
      }}
    >
      {icon ? <Ionicons name={icon} size={13} color={active ? c : p.textDim} /> : null}
      <T variant="small" color={active ? c : p.textDim}>{label}</T>
    </Pressable>
  );
}

export function Pill({ text, color, icon }: { text: string; color: string; icon?: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: color + '22', borderColor: color + '66', borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill }}>
      {icon ? <Ionicons name={icon} size={11} color={color} /> : null}
      <T variant="micro" color={color}>{text}</T>
    </View>
  );
}

export function Row({ children, gap = space.sm, style, wrap }: { children: React.ReactNode; gap?: number; style?: any; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Stat({ label, value, sub, color, icon, flex = 1 }: { label: string; value: string; sub?: string; color?: string; icon?: any; flex?: number }) {
  const { p } = useTheme();
  return (
    <View style={{ flex, backgroundColor: p.surface, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: p.glassBorder }}>
      <Row gap={5}>
        {icon ? <Ionicons name={icon} size={12} color={color ?? p.textDim} /> : null}
        <T variant="micro" color={p.textDim} numberOfLines={1}>{label.toUpperCase()}</T>
      </Row>
      <T variant="h2" color={color ?? p.text} style={{ marginTop: 4 }}>{value}</T>
      {sub ? <T variant="small" color={p.textFaint} numberOfLines={2}>{sub}</T> : null}
    </View>
  );
}

export function Bar({ value, max = 1, color, height = 8, label }: { value: number; max?: number; color?: string; height?: number; label?: string }) {
  const { p } = useTheme();
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={{ gap: 4 }}>
      {label ? <T variant="micro" color={p.textDim}>{label}</T> : null}
      <View style={{ height, backgroundColor: p.surfaceStrong, borderRadius: height, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? p.primary, borderRadius: height }} />
      </View>
    </View>
  );
}

/* -------------------------------- slider --------------------------------- */
export function Slider({ value, min, max, step = 1, onChange, label, unit, color }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; unit?: string; color?: string;
}) {
  const { p } = useTheme();
  const [w, setW] = React.useState(1);
  const c = color ?? p.primary;
  const pct = (value - min) / (max - min);
  const apply = (x: number) => {
    const raw = min + (Math.max(0, Math.min(w, x)) / w) * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(+Math.max(min, Math.min(max, snapped)).toFixed(4));
  };
  return (
    <View style={{ marginBottom: space.md }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <T variant="small" color={p.textDim}>{label}</T>
        <Row gap={6}>
          <Pressable onPress={() => onChange(+Math.max(min, value - step).toFixed(4))} hitSlop={8}><Ionicons name="remove-circle-outline" size={18} color={p.textDim} /></Pressable>
          <T variant="h3" color={c}>{value}{unit}</T>
          <Pressable onPress={() => onChange(+Math.min(max, value + step).toFixed(4))} hitSlop={8}><Ionicons name="add-circle-outline" size={18} color={p.textDim} /></Pressable>
        </Row>
      </Row>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => apply(e.nativeEvent.locationX)}
        onResponderMove={(e) => apply(e.nativeEvent.locationX)}
        style={{ paddingVertical: 10 }}
      >
        <View style={{ height: 6, backgroundColor: p.surfaceStrong, borderRadius: 6 }}>
          <View style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: 6, backgroundColor: c, borderRadius: 6 }} />
          <View style={{ position: 'absolute', left: `${Math.max(0, Math.min(1, pct)) * 100}%`, top: -7, marginLeft: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: c, borderWidth: 3, borderColor: p.bg }} />
        </View>
      </View>
    </View>
  );
}

/* --------------------------------- charts -------------------------------- */
export function Sparkline({ data, height = 60, color, fill = true, labels }: { data: number[]; height?: number; color?: string; fill?: boolean; labels?: string[] }) {
  const { p } = useTheme();
  const [w, setW] = React.useState(280);
  const c = color ?? p.primary;
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((d, i) => [(i / Math.max(1, data.length - 1)) * (w - 8) + 4, height - 8 - ((d - min) / rng) * (height - 20)]);
  const path = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
  const area = `${path} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={height}>
        <Defs>
          <SvgGrad id="spark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c} stopOpacity="0.35" />
            <Stop offset="1" stopColor={c} stopOpacity="0" />
          </SvgGrad>
        </Defs>
        {fill ? <Path d={area} fill="url(#spark)" /> : null}
        <Path d={path} stroke={c} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill={c} />
      </Svg>
      {labels ? (
        <Row style={{ justifyContent: 'space-between' }}>
          {labels.map((l, i) => <T key={i} variant="micro" color={p.textFaint}>{l}</T>)}
        </Row>
      ) : null}
    </View>
  );
}

export function MultiLine({ series, height = 140, labels }: { series: { data: number[]; color: string; name: string }[]; height?: number; labels?: string[] }) {
  const { p } = useTheme();
  const [w, setW] = React.useState(300);
  const all = series.flatMap((s) => s.data);
  if (!all.length) return null;
  const min = Math.min(...all), max = Math.max(...all), rng = max - min || 1;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width="100%" height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <Line key={g} x1={0} x2={w} y1={8 + g * (height - 26)} y2={8 + g * (height - 26)} stroke={p.glassBorder} strokeWidth={1} />
        ))}
        {series.map((s, si) => {
          const d = s.data.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, s.data.length - 1)) * (w - 6) + 3).toFixed(1)},${(height - 18 - ((v - min) / rng) * (height - 26)).toFixed(1)}`).join(' ');
          return <Path key={si} d={d} stroke={s.color} strokeWidth={2.2} fill="none" strokeLinecap="round" />;
        })}
      </Svg>
      <Row gap={12} wrap style={{ marginTop: 4 }}>
        {series.map((s) => (
          <Row key={s.name} gap={5}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: s.color }} />
            <T variant="micro" color={p.textDim}>{s.name}</T>
          </Row>
        ))}
      </Row>
      {labels ? <Row style={{ justifyContent: 'space-between' }}>{labels.map((l, i) => <T key={i} variant="micro" color={p.textFaint}>{l}</T>)}</Row> : null}
    </View>
  );
}

export function Gauge({ value, max = 100, label, sub, color, size = 150 }: { value: number; max?: number; label: string; sub?: string; color?: string; size?: number }) {
  const { p } = useTheme();
  const c = color ?? p.primary;
  const r = size / 2 - 12;
  const cx = size / 2, cy = size / 2;
  const pct = Math.max(0, Math.min(1, value / max));
  const startA = Math.PI * 0.75, sweep = Math.PI * 1.5;
  const arc = (frac: number) => {
    const a0 = startA, a1 = startA + sweep * Math.max(0.001, frac);
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return `M${x0},${y0} A${r},${r} 0 ${sweep * frac > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
  };
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size * 0.84}>
        <Path d={arc(1)} stroke={p.surfaceStrong} strokeWidth={12} fill="none" strokeLinecap="round" />
        <Path d={arc(pct)} stroke={c} strokeWidth={12} fill="none" strokeLinecap="round" />
        <SvgText x={cx} y={cy + 6} fontSize={30} fontWeight="800" fill={p.text} textAnchor="middle">{Math.round(value)}</SvgText>
        <SvgText x={cx} y={cy + 26} fontSize={11} fill={p.textDim} textAnchor="middle">{label}</SvgText>
      </Svg>
      {sub ? <T variant="small" color={p.textDim} center>{sub}</T> : null}
    </View>
  );
}

/** Grad-CAM style heat overlay rendered over the captured photo. */
export function HeatMap({ grid, size = 260, opacity = 0.6 }: { grid: number[][]; size?: number; opacity?: number }) {
  const n = grid.length;
  const cell = size / n;
  const colorFor = (v: number) => {
    if (v < 0.25) return `rgba(0,90,255,${(v * 0.5).toFixed(2)})`;
    if (v < 0.5) return `rgba(0,220,180,${(v * 0.55).toFixed(2)})`;
    if (v < 0.75) return `rgba(255,205,60,${(v * 0.7).toFixed(2)})`;
    return `rgba(255,60,60,${(v * 0.85).toFixed(2)})`;
  };
  return (
    <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, opacity }}>
      <G>
        {grid.map((row, y) => row.map((v, x) => (
          <Rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell + 0.6} height={cell + 0.6} fill={colorFor(v)} />
        )))}
      </G>
    </Svg>
  );
}

/* --------------------------------- input --------------------------------- */
export function Field({ value, onChangeText, placeholder, keyboardType, multiline, icon, onSubmit, secure }: {
  value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: any; multiline?: boolean; icon?: any; onSubmit?: () => void; secure?: boolean;
}) {
  const { p } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: p.surface, borderRadius: radius.md, borderWidth: 1, borderColor: p.glassBorder, paddingHorizontal: 12 }}>
      {icon ? <Ionicons name={icon} size={16} color={p.textFaint} /> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={p.textFaint}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secure}
        returnKeyType="send"
        onSubmitEditing={onSubmit}
        style={{ flex: 1, color: p.text, paddingVertical: 12, fontSize: 14.5, minHeight: multiline ? 70 : undefined, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null) }}
      />
    </View>
  );
}

/* --------------------------------- sheet --------------------------------- */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#000A' }} onPress={onClose} />
      <View style={{ backgroundColor: p.bgAlt, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, paddingBottom: insets.bottom + space.lg, maxHeight: '84%', borderTopWidth: 1, borderColor: p.glassBorder }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <T variant="h2">{title}</T>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close-circle" size={26} color={p.textDim} /></Pressable>
        </Row>
        <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function Empty({ icon, title, sub, action }: { icon: any; title: string; sub: string; action?: React.ReactNode }) {
  const { p } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={28} color={p.textFaint} />
      </View>
      <T variant="h3" center>{title}</T>
      <T variant="small" color={p.textDim} center>{sub}</T>
      {action}
    </View>
  );
}

export function Skeleton({ h = 60, style }: { h?: number; style?: any }) {
  const { p } = useTheme();
  const [o, setO] = React.useState(0.4);
  React.useEffect(() => {
    const t = setInterval(() => setO((v) => (v === 0.4 ? 0.75 : 0.4)), 620);
    return () => clearInterval(t);
  }, []);
  return <View style={[{ height: h, borderRadius: radius.md, backgroundColor: p.surfaceStrong, opacity: o, marginBottom: space.sm }, style]} />;
}

export function KV({ k, v, color }: { k: string; v: string; color?: string }) {
  const { p } = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 5, alignItems: 'flex-start' }}>
      <T variant="small" color={p.textDim} style={{ flex: 1 }}>{k}</T>
      <T variant="small" color={color ?? p.text} style={{ flex: 1, textAlign: 'right' }}>{v}</T>
    </Row>
  );
}

export function Divider() {
  const { p } = useTheme();
  return <View style={{ height: 1, backgroundColor: p.glassBorder, marginVertical: space.sm }} />;
}

export function Banner({ text, kind = 'info', icon }: { text: string; kind?: 'info' | 'warn' | 'danger' | 'ok'; icon?: any }) {
  const { p } = useTheme();
  const c = kind === 'warn' ? p.warn : kind === 'danger' ? p.danger : kind === 'ok' ? p.ok : p.water;
  return (
    <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: c + '18', borderColor: c + '55', borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.md }}>
      <Ionicons name={icon ?? (kind === 'ok' ? 'checkmark-circle' : 'information-circle')} size={16} color={c} style={{ marginTop: 1 }} />
      <T variant="small" color={p.text} style={{ flex: 1, lineHeight: 19 }}>{text}</T>
    </View>
  );
}

export function ScreenHeader({ title, sub, icon, right }: { title: string; sub?: string; icon?: any; right?: React.ReactNode }) {
  const { p } = useTheme();
  return (
    <Row style={{ marginBottom: space.lg, alignItems: 'flex-start' }}>
      {icon ? (
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: p.primary + '1F', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Ionicons name={icon} size={21} color={p.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T variant="h1">{title}</T>
        {sub ? <T variant="small" color={p.textDim} style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
      {right}
    </Row>
  );
}

export const gradeColor = (p: Palette, g: 'A' | 'B' | 'C') => (g === 'A' ? p.gradeA : g === 'B' ? p.gradeB : p.gradeC);

/* ======================= farmer-simple, image-forward UI ================== */

/** Full-bleed illustration header with a soft pastel scrim and title. */
export function HeroImage({ source, title, sub, height = 168, right, onPress }: {
  source: any; title?: string; sub?: string; height?: number; right?: React.ReactNode; onPress?: () => void;
}) {
  const { p } = useTheme();
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      style={{ borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.md, borderWidth: 1, borderColor: p.glassBorder, ...shadow(p, 0.9) }}
    >
      <Image source={source} style={{ width: '100%', height }} contentFit="cover" transition={260} />
      {title ? (
        <LinearGradient
          colors={['transparent', p.mode === 'dark' ? 'rgba(8,18,13,0.92)' : 'rgba(255,251,244,0.94)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: 34, paddingBottom: space.md }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="h2">{title}</T>
              {sub ? <T variant="small" color={p.textDim}>{sub}</T> : null}
            </View>
            {right}
          </Row>
        </LinearGradient>
      ) : null}
    </Wrap>
  );
}

/**
 * The core farmer control: a large picture tile with one short label.
 * Minimum 48 dp target (60 dp in elder mode), text never smaller than 15 pt.
 */
export function BigTile({ image, label, hint, onPress, tint, badge, size = 'half', icon }: {
  image?: any; label: string; hint?: string; onPress?: () => void; tint?: string; badge?: string; size?: 'half' | 'full' | 'third'; icon?: any;
}) {
  const { p, elder } = useTheme();
  const width = size === 'full' ? '100%' : size === 'third' ? '31.5%' : '48%';
  const imgH = size === 'full' ? 132 : size === 'third' ? 74 : 104;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={({ pressed }) => ({
        width: width as any,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: tint ?? p.card,
        borderWidth: 1,
        borderColor: p.glassBorder,
        marginBottom: space.md,
        minHeight: touch(elder) + 60,
        opacity: pressed ? 0.86 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        ...shadow(p, 0.7),
      })}
    >
      {image ? <Image source={image} style={{ width: '100%', height: imgH }} contentFit="cover" transition={200} /> : null}
      <View style={{ padding: space.md, gap: 2 }}>
        <Row gap={6}>
          {icon ? <Ionicons name={icon} size={16} color={p.primary} /> : null}
          <T variant="h3" numberOfLines={1} style={{ flex: 1 }}>{label}</T>
          {badge ? <Pill text={badge} color={p.primary} /> : null}
        </Row>
        {hint ? <T variant="small" color={p.textDim} numberOfLines={2}>{hint}</T> : null}
      </View>
    </Pressable>
  );
}

/** One-tap action bar item: giant circular button with a word under it. */
export function BigAction({ icon, label, onPress, color, badge }: {
  icon: any; label: string; onPress?: () => void; color?: string; badge?: number;
}) {
  const { p, elder } = useTheme();
  const c = color ?? p.primary;
  const d = elder ? 68 : 58;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: c + '24', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c + '55' }}>
        <Ionicons name={icon} size={elder ? 28 : 24} color={c} />
        {badge ? (
          <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: p.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
            <T variant="micro" color="#fff">{badge}</T>
          </View>
        ) : null}
      </View>
      <T variant="small" center numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

/** Plain-language answer strip: one sentence, one colour, one optional voice button. */
export function AnswerCard({ tone, headline, detail, image, onSpeak, action }: {
  tone: 'ok' | 'warn' | 'danger' | 'info'; headline: string; detail?: string; image?: any;
  onSpeak?: () => void; action?: React.ReactNode;
}) {
  const { p } = useTheme();
  const c = tone === 'ok' ? p.ok : tone === 'warn' ? p.warn : tone === 'danger' ? p.danger : p.water;
  const icon = tone === 'ok' ? 'checkmark-circle' : tone === 'warn' ? 'alert-circle' : tone === 'danger' ? 'warning' : 'information-circle';
  return (
    <View style={{ backgroundColor: c + '16', borderColor: c + '55', borderWidth: 1.5, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, ...shadow(p, 0.5) }}>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        {image ? (
          <Image source={image} style={{ width: 62, height: 62, borderRadius: radius.md }} contentFit="cover" />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c + '26', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon as any} size={22} color={c} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <T variant="h2" style={{ fontSize: 19 }}>{headline}</T>
          {detail ? <T variant="body" color={p.textDim} style={{ marginTop: 3, lineHeight: 21 }}>{detail}</T> : null}
        </View>
        {onSpeak ? (
          <Pressable onPress={onSpeak} hitSlop={10} accessibilityLabel="Listen" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="volume-high" size={18} color={c} />
          </Pressable>
        ) : null}
      </Row>
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

/** Horizontal picture picker used for crops, fields and varieties. */
export function PicturePicker<TItem extends { key: string; label: string; image?: any; sub?: string }>({
  items, value, onChange, width = 116,
}: { items: TItem[]; value: string; onChange: (k: string) => void; width?: number }) {
  const { p } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: space.sm, paddingRight: space.sm }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{
              width, borderRadius: radius.md, overflow: 'hidden', backgroundColor: p.card,
              borderWidth: on ? 2.5 : 1, borderColor: on ? p.primary : p.glassBorder, ...shadow(p, on ? 0.8 : 0.35),
            }}
          >
            {it.image ? <Image source={it.image} style={{ width: '100%', height: 74 }} contentFit="cover" /> : null}
            <View style={{ padding: 8 }}>
              <T variant="small" numberOfLines={1} color={on ? p.primary : p.text}>{it.label}</T>
              {it.sub ? <T variant="micro" color={p.textFaint} numberOfLines={1}>{it.sub}</T> : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Numeric stepper — easier than a keyboard for low-literacy users. */
export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, unit }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string;
}) {
  const { p, elder } = useTheme();
  const d = elder ? 56 : 46;
  const btn = (icon: string, delta: number) => (
    <Pressable
      onPress={() => onChange(+Math.max(min, Math.min(max, value + delta)).toFixed(2))}
      accessibilityLabel={`${delta > 0 ? 'increase' : 'decrease'} ${label}`}
      style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: p.primary + '1E', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.primary + '55' }}
    >
      <Ionicons name={icon as any} size={22} color={p.primary} />
    </Pressable>
  );
  return (
    <View style={{ marginBottom: space.md }}>
      <T variant="small" color={p.textDim} style={{ marginBottom: 6 }}>{label}</T>
      <Row style={{ justifyContent: 'space-between' }}>
        {btn('remove', -step)}
        <View style={{ alignItems: 'center' }}>
          <T variant="h1">{value}{unit ? <T variant="h3" color={p.textDim}> {unit}</T> : null}</T>
        </View>
        {btn('add', step)}
      </Row>
    </View>
  );
}

/** Step ribbon that explains where the farmer is in a flow. */
export function Steps({ items, active }: { items: string[]; active: number }) {
  const { p } = useTheme();
  return (
    <Row gap={6} style={{ marginBottom: space.md }} wrap>
      {items.map((s, i) => (
        <Row key={s} gap={6} style={{ flex: 1, minWidth: 92 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: i <= active ? p.primary : p.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
            {i < active
              ? <Ionicons name="checkmark" size={14} color={p.onPrimary} />
              : <T variant="micro" color={i === active ? p.onPrimary : p.textFaint}>{i + 1}</T>}
          </View>
          <T variant="small" color={i <= active ? p.text : p.textFaint} numberOfLines={1} style={{ flex: 1 }}>{s}</T>
        </Row>
      ))}
    </Row>
  );
}
