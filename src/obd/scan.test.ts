import { probeAdapter, scanCandidates, scanFailureDetail, scanFailureMessage, scanForAdapter, type OpenProbe, type ProbeOutcome } from './scan';
import { HOST_PRESETS, type Endpoint } from './presets';
import { LOCAL_NETWORK_HINT, OBDError } from './protocol';
import type { Transport, TransportHandlers } from './transport';

beforeEach(() => jest.useFakeTimers({ now: 0 }));
afterEach(() => jest.useRealTimers());

const hp = (e: Endpoint) => `${e.host}:${e.port}`;

/** Fake probe: each candidate resolves after `ms` with a scripted outcome; tracks overlap. */
function fakeProbe(script: (e: Endpoint, i: number) => { ms: number; outcome: ProbeOutcome }) {
  const calls: string[] = [];
  let open = 0;
  let maxOpen = 0;
  const probe: OpenProbe = (e, signal) => {
    const { ms, outcome } = script(e, calls.length);
    calls.push(hp(e));
    open++;
    maxOpen = Math.max(maxOpen, open);
    return new Promise<ProbeOutcome>((resolve) => {
      const t = setTimeout(() => {
        open--;
        resolve(outcome);
      }, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        open--;
        resolve({ ok: false, kind: 'aborted', raw: 'cancelled' });
      });
    });
  };
  return { probe, calls, maxOpen: () => maxOpen };
}

const noRoute: ProbeOutcome = { ok: false, kind: 'no_route', raw: 'No route to host' };
const timeout: ProbeOutcome = { ok: false, kind: 'timeout', raw: 'Operation timed out' };

describe('scanCandidates', () => {
  it('puts a custom endpoint first, then the presets in order', () => {
    const list = scanCandidates({ host: '192.168.5.5', port: 35000 });
    expect(list.map(hp)).toEqual(['192.168.5.5:35000', ...HOST_PRESETS.map(hp)]);
  });
  it('does not duplicate an endpoint that is already a preset', () => {
    expect(scanCandidates({ host: '192.168.0.10', port: 35000 }).map(hp)).toEqual(HOST_PRESETS.map(hp));
  });
});

describe('scanForAdapter', () => {
  const candidates = HOST_PRESETS.map((p) => ({ host: p.host, port: p.port }));

  it('is strictly sequential and stops at the first adapter that answers', async () => {
    const f = fakeProbe((_e, i) => ({ ms: 1000, outcome: i === 3 ? { ok: true, reply: 'ELM327 v1.5' } : timeout }));
    const progress: string[] = [];
    const p = scanForAdapter(candidates, f.probe, { onProgress: (e, i, n) => progress.push(`${hp(e)} (${i}/${n})`) });
    await jest.advanceTimersByTimeAsync(10000);
    const r = await p;
    expect(r.found).toEqual(candidates[3]);
    expect(f.calls).toEqual(candidates.slice(0, 4).map(hp));
    expect(f.maxOpen()).toBe(1);
    expect(progress[3]).toBe('192.168.4.1:35000 (4/6)');
  });

  it('flags allNoRoute when every attempt had no route', async () => {
    const f = fakeProbe(() => ({ ms: 50, outcome: noRoute }));
    const p = scanForAdapter(candidates, f.probe);
    await jest.advanceTimersByTimeAsync(1000);
    const r = await p;
    expect(r.found).toBeNull();
    expect(r.allNoRoute).toBe(true);
    expect(scanFailureMessage(r)).toContain(LOCAL_NETWORK_HINT);
    expect(scanFailureDetail(r)).toMatch(/^scan · ADAPTER_NOT_FOUND\/no_route · 192\.168\.0\.10:35000=no_route/);
  });

  it('uses the not-found copy when failures are mixed', async () => {
    const f = fakeProbe((_e, i) => ({ ms: 50, outcome: i === 0 ? timeout : noRoute }));
    const p = scanForAdapter(candidates, f.probe);
    await jest.advanceTimersByTimeAsync(1000);
    const r = await p;
    expect(r.allNoRoute).toBe(false);
    expect(scanFailureMessage(r)).toBe('Adaptör bulunamadı. Telefonun adaptörün Wi-Fi ağına bağlı olduğundan emin ol.');
  });

  it('finishes within 40 s when every candidate times out', async () => {
    const f = fakeProbe(() => ({ ms: 3000, outcome: timeout }));
    let doneAt = -1;
    const p = scanForAdapter(candidates, f.probe).then((r) => ((doneAt = Date.now()), r));
    await jest.advanceTimersByTimeAsync(60000);
    const r = await p;
    expect(r.found).toBeNull();
    expect(doneAt).toBeLessThanOrEqual(40000);
    expect(f.calls).toHaveLength(6);
  });

  it('enforces the 40 s budget even when attempts are slow', async () => {
    const f = fakeProbe(() => ({ ms: 15000, outcome: timeout }));
    let doneAt = -1;
    const p = scanForAdapter(candidates, f.probe).then((r) => ((doneAt = Date.now()), r));
    await jest.advanceTimersByTimeAsync(60000);
    const r = await p;
    expect(doneAt).toBe(40000);
    expect(r.budgetExceeded).toBe(true);
    expect(f.calls).toHaveLength(3);
  });

  it('stops opening candidates once the signal aborts', async () => {
    const f = fakeProbe(() => ({ ms: 2000, outcome: timeout }));
    const ac = new AbortController();
    const p = scanForAdapter(candidates, f.probe, { signal: ac.signal });
    await jest.advanceTimersByTimeAsync(3000); // 2nd attempt in flight
    ac.abort();
    await jest.advanceTimersByTimeAsync(20000);
    const r = await p;
    expect(r.aborted).toBe(true);
    expect(f.calls).toHaveLength(2);
  });
});

/** Minimal transport for probeAdapter. */
class ProbeTransport implements Transport {
  readonly label = 'probe';
  written: string[] = [];
  closed = false;
  private h: TransportHandlers | null = null;
  constructor(
    private openError: string | null,
    private reply: (data: string) => string | null
  ) {}
  async open(h: TransportHandlers): Promise<void> {
    if (this.openError) throw new OBDError('CONNECT_FAILED', this.openError, { step: 'tcp', raw: this.openError });
    this.h = h;
  }
  write(data: string): void {
    this.written.push(data);
    const r = this.reply(data);
    if (r !== null) setTimeout(() => this.h?.onData(r), 20);
  }
  close(): void {
    this.closed = true;
  }
}

describe('probeAdapter', () => {
  it('writes only a bare CR and ATI, then closes', async () => {
    const t = new ProbeTransport(null, (d) => (d === 'ATI\r' ? 'ELM327 v2.1\r\r>' : '>'));
    const p = probeAdapter(t, new AbortController().signal);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toEqual({ ok: true, reply: 'ELM327 v2.1' });
    expect(t.written).toEqual(['\r', 'ATI\r']);
    expect(t.closed).toBe(true);
  });

  it('reports no_answer when connected but silent for 2.5 s', async () => {
    const t = new ProbeTransport(null, () => null);
    let doneAt = -1;
    const p = probeAdapter(t, new AbortController().signal).then((r) => ((doneAt = Date.now()), r));
    await jest.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toMatchObject({ ok: false, kind: 'no_answer' });
    expect(doneAt).toBe(2500);
    expect(t.written).toEqual(['\r', 'ATI\r']);
    expect(t.closed).toBe(true);
  });

  it('classifies open failures from the raw native text', async () => {
    const t = new ProbeTransport('No route to host', () => null);
    await expect(probeAdapter(t, new AbortController().signal)).resolves.toEqual({
      ok: false,
      kind: 'no_route',
      raw: 'No route to host',
    });
    expect(t.written).toEqual([]);
    expect(t.closed).toBe(true);
  });
});
