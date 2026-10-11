import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, fonts } from './theme';

/** 24x24 stroke icon paths (SF Symbols-like, 1.5-2.2 stroke). */
export const ICON = {
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M7 7l10 10M17 7L7 17',
  warn: 'M12 4.5l8.5 14.5h-17zM12 10.5v3.5M12 16.6v.1',
  info: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 8v4.5M12 15.8v.2',
  copy: 'M10.5 8h7A2.5 2.5 0 0 1 20 10.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 17.5v-7A2.5 2.5 0 0 1 10.5 8zM16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  lock: 'M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3',
  trash: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  share: 'M12 3.5v11M8 7.5l4-4 4 4M5.5 12.5v6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-6',
  plus: 'M12 5v14M5 12h14',
  // "Daha fazla" rows
  idCard: 'M4 6.5h16v11H4zM8 10.5h5M8 13.5h8',
  doc: 'M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5zM9 12.5h6M9 16h4',
  battery: 'M4 8h14v8H4zM18 10.5h2v3h-2M8 12h4M10 10v4',
  shield: 'M9 11.5l2 2 4-4M12 3.5l7.5 3v5c0 4.5-3.2 8-7.5 9-4.3-1-7.5-4.5-7.5-9v-5z',
  terminal: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
  wifi: 'M3.5 9a12 12 0 0 1 17 0M6.5 12.2a7.5 7.5 0 0 1 11 0M9.5 15.3a3 3 0 0 1 5 0M12 18.5v.1',
  clock: 'M12 7v5l3 2M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z',
  bluetooth: 'M7 7.5l10 9-5 4.5V3l5 4.5-10 9',
  plug: 'M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21',
  question: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.5M12 16.6v.1',
  // Tabs
  tabGaraj:
    'M3.5 15.5v-2.3c0-.8.5-1.4 1.2-1.7L7 10.6l2-3.1c.4-.6 1-.9 1.7-.9h3.4c.7 0 1.3.3 1.7.9l2.2 3.1 1.6.4c.9.2 1.6 1 1.6 1.9v2.6M7.5 14.1a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8zM16.5 14.1a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8zM9.4 16h5.2',
  tabBakim: 'M7.5 4.5h9A2.5 2.5 0 0 1 19 7v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18V7a2.5 2.5 0 0 1 2.5-2.5zM9 4.5V3.5h6v1M8.5 11l1.6 1.6 3.2-3.2M8.5 16.5h7',
  tabTani: 'M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4 4M7.5 11h2l1-2 1.5 4 1-2h1.5',
  tabCanli: 'M3 12h4l2.2-5.5 4.6 11 2.2-5.5H21',
  tabDaha: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z',
} as const;

export type IconName = keyof typeof ICON;

export function Icon({
  name,
  size = 16,
  color = colors.text,
  stroke = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={ICON[name]} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {name === 'tabDaha' ? (
        <>
          <Circle cx={8} cy={12} r={0.9} fill={color} />
          <Circle cx={12} cy={12} r={0.9} fill={color} />
          <Circle cx={16} cy={12} r={0.9} fill={color} />
        </>
      ) : null}
    </Svg>
  );
}

/** The Otova mark: a bold ">" prompt with an amber cursor block. */
export function LogoMark({
  size = 22,
  color = colors.text,
  cursor = colors.amber,
}: {
  size?: number;
  color?: string;
  cursor?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path d="M17 18L33 32L17 46" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={37} y={40} width={12} height={6} rx={1.5} fill={cursor} />
    </Svg>
  );
}

/** Mark + lowercase "otova" wordmark. */
export function Wordmark({ size = 19, color = colors.text }: { size?: number; color?: string }) {
  return (
    <View style={styles.wordmark}>
      <LogoMark size={size * 1.16} color={color} />
      <Text style={[styles.wordmarkText, { fontSize: size, color, letterSpacing: -0.045 * size }]}>otova</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  wordmarkText: { fontFamily: fonts.bodySemiBold },
});
