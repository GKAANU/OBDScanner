/**
 * Otova theme — dark-only for v1.
 * Geist for body, Geist Mono for hex/codes/values.
 */

export const colors = {
  bg: '#0a0a0a',
  card: '#161616',
  cardElevated: '#1f1f1f',
  border: '#262626',
  body: '#e5e5e5',
  muted: '#737373',
  mutedStrong: '#a3a3a3',
  accent: '#3B82F6',
  accentSoft: '#1d4ed8',
  value: '#fbbf24',
  warn: '#f59e0b',
  error: '#ef4444',
  ok: '#22c55e',
  okSoft: '#16a34a',
} as const;

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
  s: 6,
  m: 10,
  l: 14,
  xl: 20,
} as const;

export const fontSize = {
  xs: 11,
  s: 12,
  m: 14,
  l: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
} as const;
