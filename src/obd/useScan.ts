import { useCallback, useRef, useState } from 'react';
import { useOBD } from './context';
import { userMessage } from './protocol';
import type { FreezeFrame } from './client';
import type { ReadinessReport } from './parsers';
import { useGarage } from '../garage/store';
import type { ScanSummary } from '../garage/types';

export const SCAN_STEPS = [
  'Kayıtlı kodlar okunuyor',
  'Bekleyen kodlar okunuyor',
  'Kalıcı kodlar okunuyor',
  'Hazırlık monitörleri okunuyor',
  'Freeze frame okunuyor',
] as const;

export type ScanResult = {
  at: string;
  stored: string[];
  pending: string[];
  permanent: string[];
  readiness: ReadinessReport | null;
  freezeFrame: FreezeFrame | null;
};

/**
 * Full Tanı scan, sequential through the single-flight client:
 * Mode 03 / 07 / 0A, Mode 01 PID 01, Mode 02 frame 00.
 * The result lives in memory for this session; a summary is persisted
 * through the garage store so Garaj can show it offline.
 */
export function useScan() {
  const { client, state, battery } = useOBD();
  const { setLastScan } = useGarage();
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const scan = useCallback(async (): Promise<ScanResult | null> => {
    if (state !== 'ready' || busyRef.current) return null;
    busyRef.current = true;
    setScanning(true);
    setError(null);
    setProgress(0);
    const at = (i: number) => {
      setStep(SCAN_STEPS[i]);
      setProgress(i / SCAN_STEPS.length);
    };
    try {
      at(0);
      const stored = await client.readDTCs('stored');
      at(1);
      const pending = await client.readDTCs('pending');
      at(2);
      const permanent = await client.readDTCs('permanent');
      at(3);
      let readiness: ReadinessReport | null = null;
      try {
        readiness = await client.readReadiness();
      } catch {}
      at(4);
      let freezeFrame: FreezeFrame | null = null;
      try {
        freezeFrame = await client.readFreezeFrame();
      } catch {}
      setProgress(1);
      const r: ScanResult = { at: new Date().toISOString(), stored, pending, permanent, readiness, freezeFrame };
      setResult(r);
      const summary: ScanSummary = {
        at: r.at,
        stored,
        pending,
        permanent,
        milOn: readiness ? readiness.milOn : null,
        monitors: readiness ? readiness.monitors.map((m) => ({ name: m.name, supported: m.supported, ready: m.ready })) : [],
        battery,
      };
      setLastScan(summary);
      return r;
    } catch (e) {
      setError(userMessage(e));
      return null;
    } finally {
      busyRef.current = false;
      setScanning(false);
      setStep(null);
    }
  }, [client, state, battery, setLastScan]);

  return { scan, scanning, progress, step, result, error };
}
