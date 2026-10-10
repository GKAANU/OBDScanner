import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Icon, type IconName } from './icons';
import { colors, fonts, radius, spacing, tabular, tone, type Tone } from './theme';

/* ---------- Layout ---------- */

/** Safe-area screen with a scrolling body (pass `scroll={false}` for custom layouts). */
export function Screen({
  children,
  scroll = true,
  contentStyle,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function ScreenTitle({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.flex}>
        <Text style={styles.h1}>{title}</Text>
        {sub ? typeof sub === 'string' ? <Text style={styles.sub}>{sub}</Text> : sub : null}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  hero,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Hero cards are a touch lighter with a 22 radius. */
  hero?: boolean;
}) {
  const s = [styles.card, hero && styles.cardHero, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/** A divider-separated row inside a Card list. */
export function Divider() {
  return <View style={styles.divider} />;
}

/* ---------- Text bits ---------- */

export function Chip({ label, t = 'neutral', style }: { label: string; t?: Tone; style?: StyleProp<ViewStyle> }) {
  const [fg, bg] = tone[t];
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Big({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.big, tabular, style]}>{children}</Text>;
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

/* ---------- Buttons ---------- */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'dangerSoft' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const v = BUTTON[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border ? 1 : 0 },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={15} color={v.fg} stroke={1.7} /> : null}
          <Text style={[styles.btnText, compact && styles.btnTextCompact, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const BUTTON = {
  primary: { bg: colors.blue, fg: '#fff', border: undefined },
  secondary: { bg: '#171513', fg: colors.text, border: colors.line },
  danger: { bg: colors.error, fg: '#fff', border: undefined },
  dangerSoft: { bg: 'rgba(239,68,68,0.07)', fg: colors.error, border: 'rgba(239,68,68,0.28)' },
  ghost: { bg: colors.line2, fg: colors.text, border: undefined },
} as const;

/** Small rounded pill button used in screen headers ("Yeniden tara", "Sensör seç"). */
export function PillButton({ label, icon, onPress }: { label: string; icon?: IconName; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={13} color={colors.blue} stroke={2} /> : null}
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

/** iOS-style switch, drawn to match the design (green when on). */
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: on ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [on, x]);
  return (
    <Pressable onPress={() => onChange?.(!on)} disabled={disabled} hitSlop={6} style={disabled && styles.disabled}>
      <Animated.View
        style={[
          styles.toggle,
          { backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [colors.track, colors.ok] }) },
        ]}
      >
        <Animated.View
          style={[styles.knob, { left: x.interpolate({ inputRange: [0, 1], outputRange: [2, 22] }) }]}
        />
      </Animated.View>
    </Pressable>
  );
}

/* ---------- Gauges ---------- */

/** Progress ring (0..1), starts at 12 o'clock. */
export function Ring({
  value,
  size = 60,
  stroke = 6,
  color = colors.amber,
  track = colors.line,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2 - 0.5;
  const c = 2 * Math.PI * r;
  const p = clamp01(value);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${p * c} ${c}`}
          />
        ) : null}
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
    </View>
  );
}

/** 270° arc gauge (0..1), opening at the bottom. */
export function Arc({
  value,
  size = 104,
  stroke = 7,
  color = colors.amber,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  // Drawn in a 100x100 box, r=42, like the design.
  const C = 2 * Math.PI * 42;
  const arc = C * 0.75;
  const p = Math.max(0.001, clamp01(value));
  return (
    <View style={{ width: size, height: size * 0.885 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Circle
          cx={50}
          cy={50}
          r={42}
          fill="none"
          stroke={colors.line}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${C}`}
          rotation={135}
          origin="50, 50"
        />
        <Circle
          cx={50}
          cy={50}
          r={42}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc * p} ${C}`}
          rotation={135}
          origin="50, 50"
        />
      </Svg>
      {children ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', paddingTop: size * 0.3 }]}>{children}</View>
      ) : null}
    </View>
  );
}

export function ProgressBar({ value, color = colors.amber, height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <View style={{ width: `${clamp01(value) * 100}%`, height: '100%', borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/** Tiny line chart of recent values (auto-scaled). */
export function Sparkline({ values, color = colors.amber, height = 26 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <View style={{ height }} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const rg = hi - lo || 1;
  const n = values.length - 1;
  const pts = values.map((v, i) => `${((i * 100) / n).toFixed(1)},${(height - 2 - ((v - lo) / rg) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <Polyline points={pts} fill="none" stroke={color} strokeOpacity={0.7} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}

/* ---------- Sheets & modals ---------- */

/** Bottom sheet (slides up), with a grab handle. */
export function Sheet({
  visible,
  onClose,
  children,
  tall,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  tall?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.sheet, tall && styles.sheetTall, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Centered confirm dialog (destructive by default). */
export function ConfirmModal({
  visible,
  title,
  body,
  note,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  icon = 'trash',
}: {
  visible: boolean;
  title: string;
  body: string;
  note?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  icon?: IconName;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.modalBackdrop]} onPress={onCancel}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalIcon}>
            <Icon name={icon} size={22} color={colors.error} stroke={1.7} />
          </View>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          {note ? <Text style={styles.modalNote}>{note}</Text> : null}
          <View style={{ gap: spacing.s, marginTop: 18 }}>
            <Button label={confirmLabel} variant="danger" onPress={onConfirm} loading={busy} />
            <Button label="Vazgeç" variant="ghost" onPress={onCancel} disabled={busy} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------- helpers ---------- */

export function clamp01(v: number): number {
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.l, paddingTop: 6, paddingBottom: spacing.xxxl },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6, gap: spacing.m },
  h1: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 32, lineHeight: 36, letterSpacing: -1.1 },
  sub: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: 6 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 24,
    marginBottom: 10,
    marginHorizontal: 4,
  },
  sectionTitle: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 17, letterSpacing: -0.2 },
  link: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  cardHero: { backgroundColor: colors.cardHi, borderRadius: radius.hero },
  divider: { height: 1, backgroundColor: colors.line },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, alignSelf: 'flex-start' },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
  big: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 28, letterSpacing: -0.8 },
  hint: { color: colors.faint, fontFamily: fonts.body, fontSize: 12, textAlign: 'center', marginTop: 10 },
  btn: {
    height: 48,
    borderRadius: radius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.l,
  },
  btnCompact: { height: 40, borderRadius: radius.m },
  btnText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  btnTextCompact: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  pill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#171513',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 13.5 },
  toggle: { width: 51, height: 31, borderRadius: 16 },
  knob: {
    position: 'absolute',
    top: 2,
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  barTrack: { backgroundColor: colors.line, overflow: 'hidden' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
  sheet: {
    marginTop: 'auto',
    maxHeight: '88%',
    backgroundColor: colors.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: colors.line2,
  },
  sheetTall: { height: '88%' },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#3f3a35', alignSelf: 'center', marginTop: 8 },
  sheetContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24 },
  modalBackdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'center', paddingHorizontal: 22 },
  modal: {
    backgroundColor: colors.sheetInner,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sheet,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: -0.4, marginTop: 14 },
  modalBody: { color: colors.text2, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 8 },
  modalNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 10 },
});
