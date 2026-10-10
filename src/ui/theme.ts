/**
 * Otova theme v2 ("araç asistanı") — warm, deep dark; layered cards.
 * Geist for everything; Geist Mono only for codes, hex and raw data.
 */

export const colors = {
  bg: '#0c0b0a',
  card: '#181614',
  cardHi: '#1b1816',
  elevated: '#221f1c',
  inset: '#0f0e0d',
  sheet: '#171513',
  sheetInner: '#1f1c19',
  line: '#27231f',
  line2: '#2a2622',
  track: '#3a3530',
  text: '#f0ede8',
  text2: '#d6d3d1',
  muted: '#a8a29e',
  faint: '#78716c',
  faint2: '#57534e',
  amber: '#fbbf24',
  amberDeep: '#d9a21f',
  blue: '#3B82F6',
  ok: '#22c55e',
  warn: '#f59e0b',
  error: '#ef4444',
  flash: 'rgba(59,130,246,0.12)',
  okBg: 'rgba(34,197,94,0.12)',
  warnBg: 'rgba(245,158,11,0.13)',
  errorBg: 'rgba(239,68,68,0.13)',
  blueBg: 'rgba(59,130,246,0.14)',
  amberBg: 'rgba(251,191,36,0.16)',
  backdrop: 'rgba(0,0,0,0.6)',
} as const;

/** Status → [text color, chip background]. */
export const tone = {
  ok: [colors.ok, colors.okBg],
  warn: [colors.warn, colors.warnBg],
  error: [colors.error, colors.errorBg],
  neutral: [colors.muted, colors.elevated],
  blue: [colors.blue, colors.blueBg],
} as const;
export type Tone = keyof typeof tone;

export const fonts = {
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemiBold: 'Geist_600SemiBold',
  bodyBold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  monoSemiBold: 'GeistMono_600SemiBold',
} as const;

export const spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  s: 8,
  m: 12,
  l: 14,
  card: 20,
  hero: 22,
  sheet: 24,
} as const;

export const fontSize = {
  xs: 11,
  s: 12.5,
  m: 14,
  l: 15,
  xl: 17,
  xxl: 22,
  xxxl: 32,
} as const;

/** Tabular figures for any changing number. */
export const tabular = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };
