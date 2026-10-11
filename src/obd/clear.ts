import { parseClearResponse } from './parsers';
import type { DTCKind } from './client';

export type ClearKind = 'ok' | 'engine-running' | 'refused' | 'no-response';

export type ClearResult = {
  kind: ClearKind;
  /** The ECU's reply to Mode 04, whitespace-collapsed ("boş" when empty). */
  raw: string;
  /** Codes from `watch` that are stored or pending again right after the clear. */
  back: string[];
  /** Permanent codes after the clear (Mode 04 never removes these). */
  permanent: string[];
  /** Lists read after a successful clear; null when the re-read failed. */
  after: { stored: string[]; pending: string[]; permanent: string[] } | null;
};

type Clearer = {
  clearDTCs(): Promise<string>;
  readDTCs(kind: DTCKind): Promise<string[]>;
};

/**
 * Send Mode 04, then re-read Mode 03 / 07 / 0A to tell the user what really
 * happened: cleared, came straight back (fault active), or permanent.
 */
export async function clearAndVerify(client: Clearer, watch: string[]): Promise<ClearResult> {
  const reply = await client.clearDTCs();
  const raw = reply.trim().replace(/\s+/g, ' ') || 'boş';
  const kind = parseClearResponse(reply);
  if (kind !== 'ok') return { kind, raw, back: [], permanent: [], after: null };
  try {
    const stored = await client.readDTCs('stored');
    const pending = await client.readDTCs('pending');
    const permanent = await client.readDTCs('permanent');
    const back = watch.filter((c) => stored.includes(c) || pending.includes(c));
    return { kind, raw, back, permanent, after: { stored, pending, permanent } };
  } catch {
    return { kind, raw, back: [], permanent: [], after: null };
  }
}
