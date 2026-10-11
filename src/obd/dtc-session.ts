import { useSyncExternalStore } from 'react';
import type { FreezeFrame } from './client';

/**
 * The Tanı results the code detail screen reads. Tanı publishes its current
 * view here (and a rescan function), so the detail route needs no params
 * beyond the code itself. Memory only.
 */
export type DtcSession = {
  at: string;
  stored: string[];
  pending: string[];
  permanent: string[];
  freezeFrame: FreezeFrame | null;
  /** False when showing the saved summary from an earlier session. */
  live: boolean;
};

let current: DtcSession | null = null;
let rescan: (() => Promise<unknown>) | null = null;
const listeners = new Set<() => void>();

export function setDtcSession(s: DtcSession | null): void {
  current = s;
  listeners.forEach((l) => l());
}

export function setDtcRescan(fn: (() => Promise<unknown>) | null): void {
  rescan = fn;
}

export function rescanDtcs(): void {
  void rescan?.();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDtcSession(): DtcSession | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** All codes in display order (stored, pending, permanent), de-duplicated. */
export function sessionCodes(s: DtcSession): string[] {
  return Array.from(new Set([...s.stored, ...s.pending, ...s.permanent]));
}
