/**
 * "Otomatik bul": try common adapter addresses one after another until one
 * answers like an ELM327. Strictly sequential (never two sockets at once),
 * bounded by a total time budget, cancellable. The only bytes ever written
 * to a candidate are a bare CR and `ATI` (read-only adapter identify).
 *
 * No React Native imports: the TCP transport is injected, so Jest can
 * drive this with fake transports and fake timers.
 */
import type { Transport } from './transport';
import { classifyConnectError, connectMessage, NOT_FOUND_MESSAGE, OBDError, type ConnectErrorKind } from './protocol';
import { HOST_PRESETS, hostPort, sameEndpoint, type Endpoint } from './presets';
import { NOOP_LOGGER, type DiagLogger } from './diag-log';

export const SCAN_BUDGET_MS = 40000;
/** After TCP connect: how long to wait for a `>` from the adapter. */
export const PROBE_ANSWER_MS = 2500;
/** How long to wait for the flush CR's prompt before sending ATI. */
const PROBE_FLUSH_MS = 500;

export type ProbeOutcome =
  | { ok: true; reply: string }
  /** kind 'no_answer': TCP connected but nothing answered with a prompt. */
  | { ok: false; kind: ConnectErrorKind | 'no_answer' | 'aborted'; raw: string };

export type OpenProbe = (endpoint: Endpoint, signal: AbortSignal) => Promise<ProbeOutcome>;

export type ScanAttempt = { endpoint: Endpoint; outcome: ProbeOutcome };

export type ScanResult = {
  found: Endpoint | null;
  attempts: ScanAttempt[];
  aborted: boolean;
  budgetExceeded: boolean;
  /** Every attempt failed with no_route / net_unreachable (Wi-Fi or Local Network permission). */
  allNoRoute: boolean;
};

export type ScanOptions = {
  budgetMs?: number;
  signal?: AbortSignal;
  /** Called before each attempt with its 1-based index. */
  onProgress?: (endpoint: Endpoint, index: number, total: number) => void;
  log?: DiagLogger;
};

/** The typed/saved endpoint first (unless it is a preset), then the presets in order. */
export function scanCandidates(current: Endpoint | null, presets: readonly Endpoint[] = HOST_PRESETS): Endpoint[] {
  const list = presets.map((p) => ({ host: p.host, port: p.port }));
  if (current && current.host && !list.some((p) => sameEndpoint(p, current))) {
    list.unshift({ host: current.host, port: current.port });
  }
  return list;
}

function isNoRoute(o: ProbeOutcome): boolean {
  return !o.ok && (o.kind === 'no_route' || o.kind === 'net_unreachable');
}

export async function scanForAdapter(
  candidates: Endpoint[],
  openProbe: OpenProbe,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const budgetMs = options.budgetMs ?? SCAN_BUDGET_MS;
  const log = options.log ?? NOOP_LOGGER;
  const signal = options.signal;
  const start = Date.now();
  const attempts: ScanAttempt[] = [];
  let budgetExceeded = false;
  let found: Endpoint | null = null;

  for (let i = 0; i < candidates.length; i++) {
    if (signal?.aborted) break;
    const remaining = budgetMs - (Date.now() - start);
    if (remaining <= 0) {
      budgetExceeded = true;
      break;
    }
    const endpoint = candidates[i];
    options.onProgress?.(endpoint, i + 1, candidates.length);
    log.log(`scan ${i + 1}/${candidates.length} ${hostPort(endpoint)}`);

    // Per-attempt signal: aborted by the caller or when the budget runs out.
    const inner = new AbortController();
    const onAbort = () => inner.abort();
    signal?.addEventListener('abort', onAbort);
    const budgetTimer = setTimeout(() => {
      budgetExceeded = true;
      inner.abort();
    }, remaining);
    let outcome: ProbeOutcome;
    try {
      outcome = await openProbe(endpoint, inner.signal);
    } catch (e) {
      outcome = { ok: false, kind: 'other', raw: e instanceof Error ? e.message : String(e) };
    } finally {
      clearTimeout(budgetTimer);
      signal?.removeEventListener('abort', onAbort);
    }
    attempts.push({ endpoint, outcome });
    log.log(
      `scan ${hostPort(endpoint)}: ${outcome.ok ? `answered: ${outcome.reply}` : `${outcome.kind}: ${outcome.raw}`}`
    );
    if (outcome.ok) {
      found = endpoint;
      break;
    }
  }

  const aborted = !!signal?.aborted && !found;
  const result: ScanResult = {
    found,
    attempts,
    aborted,
    budgetExceeded: budgetExceeded && !found,
    allNoRoute: !found && attempts.length > 0 && attempts.every((a) => isNoRoute(a.outcome)),
  };
  log.log(
    `scan done in ${Date.now() - start}ms: ${found ? `found ${hostPort(found)}` : 'not found'}` +
      `${result.aborted ? ' (cancelled)' : ''}${result.budgetExceeded ? ' (budget exceeded)' : ''}`
  );
  return result;
}

/** Wait for `ms` or until `signal` aborts; resolves false when aborted. */
function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const done = (v: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(v);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(true), ms);
    signal.addEventListener('abort', onAbort);
  });
}

/**
 * One scan attempt over any Transport: open, write a bare CR, then `ATI`,
 * and succeed if a `>` prompt arrives within 2.5 s of the connect. The
 * transport is always closed afterwards.
 */
export async function probeAdapter(
  transport: Transport,
  signal: AbortSignal,
  answerMs = PROBE_ANSWER_MS
): Promise<ProbeOutcome> {
  let buffer = '';
  let prompt: (() => void) | null = null;
  const handlers = {
    onData: (chunk: string) => {
      buffer += chunk;
      if (buffer.includes('>')) prompt?.();
    },
    onClose: () => {},
  };

  const opened = await new Promise<ProbeOutcome | null>((resolve) => {
    if (signal.aborted) return resolve({ ok: false, kind: 'aborted', raw: 'cancelled' });
    const onAbort = () => resolve({ ok: false, kind: 'aborted', raw: 'cancelled' });
    signal.addEventListener('abort', onAbort);
    transport.open(handlers).then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve(null);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        const raw = e instanceof OBDError ? e.raw ?? e.message : e instanceof Error ? e.message : String(e);
        resolve({ ok: false, kind: classifyConnectError(raw), raw });
      }
    );
  });
  if (opened) {
    transport.close();
    return opened;
  }

  const waitPrompt = (ms: number) =>
    new Promise<boolean>((resolve) => {
      if (buffer.includes('>')) return resolve(true);
      prompt = () => {
        prompt = null;
        resolve(true);
      };
      void wait(ms, signal).then(() => {
        if (prompt) {
          prompt = null;
          resolve(buffer.includes('>'));
        }
      });
    });

  const started = Date.now();
  try {
    transport.write('\r');
    const flushed = await waitPrompt(Math.min(PROBE_FLUSH_MS, answerMs));
    if (signal.aborted) return { ok: false, kind: 'aborted', raw: 'cancelled' };
    const flushReply = buffer;
    buffer = '';
    transport.write('ATI\r');
    const left = Math.max(0, answerMs - (Date.now() - started));
    const answered = await waitPrompt(left);
    if (signal.aborted) return { ok: false, kind: 'aborted', raw: 'cancelled' };
    if (answered || flushed) {
      return { ok: true, reply: (answered ? buffer : flushReply).replace(/>/g, '').trim() };
    }
    return { ok: false, kind: 'no_answer', raw: buffer ? `no prompt; got: ${buffer}` : 'connected, no reply' };
  } catch (e) {
    return { ok: false, kind: 'other', raw: e instanceof Error ? e.message : String(e) };
  } finally {
    transport.close();
  }
}

/** Turkish message for a scan that found nothing (no-route adds the Local Network hint). */
export function scanFailureMessage(result: ScanResult): string {
  return result.allNoRoute ? connectMessage('no_route') : NOT_FOUND_MESSAGE;
}

/** Technical one-liner, same shape as errorDetail(): `scan · ADAPTER_NOT_FOUND · ...`. */
export function scanFailureDetail(result: ScanResult): string {
  const tried = result.attempts
    .map((a) => `${hostPort(a.endpoint)}=${a.outcome.ok ? 'ok' : a.outcome.kind}`)
    .join(', ');
  const flags = `${result.budgetExceeded ? ' (40 s)' : ''}`;
  return `scan · ADAPTER_NOT_FOUND${result.allNoRoute ? '/no_route' : ''} · ${tried || 'none tried'}${flags}`;
}
