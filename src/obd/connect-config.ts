/**
 * Pure connect-time decisions used by the OBD context (kept free of React
 * and native imports so Jest can cover them).
 */
import type { OBDConfig } from './client';

export type ConnectionState = 'idle' | 'connecting' | 'initializing' | 'ready' | 'error';

/**
 * Config for a connect attempt: the saved config plus the caller's
 * overrides. Demo mode is only ever entered when the caller asks for it
 * explicitly (`demo: true`, the demo buttons); a saved `demo: true` from an
 * earlier session never leaks into a plain Bağlan.
 */
export function resolveConnectConfig(saved: OBDConfig, overrides?: Partial<OBDConfig>): OBDConfig {
  return { ...saved, ...overrides, demo: overrides?.demo === true };
}

/**
 * Whether a connect (or Otomatik bul) may start now: settings must have
 * finished loading from storage (successfully or not), and no link may be
 * open or opening.
 */
export function canStartConnect(s: { hydrated: boolean; connected: boolean; connecting: boolean }): boolean {
  return s.hydrated && !s.connected && !s.connecting;
}
