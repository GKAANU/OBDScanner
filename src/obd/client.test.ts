import { OBDClient } from './client';
import { OBDError } from './protocol';
import type { Transport, TransportHandlers } from './transport';

/**
 * Scripted in-memory adapter. `reply(cmd)` returns the chunks to emit for a
 * command (each chunk delivered on its own tick), or null to stay silent.
 */
class FakeTransport implements Transport {
  readonly label = 'fake';
  handlers: TransportHandlers | null = null;
  written: string[] = [];
  closed = false;
  /** True between a write and the prompt of its reply. */
  awaitingPrompt = false;
  /** Writes that arrived before the previous reply's prompt. */
  overlaps = 0;

  constructor(private reply: (cmd: string, n: number) => string[] | null) {}

  async open(h: TransportHandlers): Promise<void> {
    this.handlers = h;
  }
  write(data: string): void {
    const cmd = data.replace(/\r$/, '');
    if (this.awaitingPrompt) this.overlaps++;
    this.awaitingPrompt = true;
    this.written.push(cmd);
    const chunks = this.reply(cmd, this.written.filter((w) => w === cmd).length);
    if (!chunks) return;
    let delay = 0;
    for (const c of chunks) {
      delay += 1;
      setTimeout(() => {
        if (c.includes('>')) this.awaitingPrompt = false;
        this.handlers?.onData(c);
      }, delay);
    }
  }
  close(): void {
    this.closed = true;
  }
  /** Simulate the dongle dropping the link. */
  drop(): void {
    this.handlers?.onClose(new Error('socket closed'));
  }
}

async function connected(reply: (cmd: string, n: number) => string[] | null, timeoutMs = 200) {
  const t = new FakeTransport(reply);
  const c = new OBDClient();
  await c.connect(t, { timeoutMs });
  return { c, t };
}

describe('OBDClient framing and queue', () => {
  it('resolves when the prompt arrives in a later chunk', async () => {
    const { c } = await connected(() => ['41 0C ', '1A F8\r', '\r>']);
    await expect(c.send('010C')).resolves.toBe('41 0C 1A F8');
  });

  it('serializes concurrent commands instead of overlapping them', async () => {
    const t = new FakeTransport((cmd) => [`R-${cmd}`, '\r>']);
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 200 });
    const results = await Promise.all([c.send('A'), c.send('B'), c.send('C')]);
    expect(results).toEqual(['R-A', 'R-B', 'R-C']);
    expect(t.written).toEqual(['A', 'B', 'C']);
    expect(t.overlaps).toBe(0);
  });

  it('drops stray bytes left after a prompt before the next command', async () => {
    // Junk glued after the first prompt must not leak into B's answer.
    const { c } = await connected((cmd) => (cmd === 'A' ? ['one>junk'] : ['two>']));
    expect(await c.send('A')).toBe('one');
    expect(await c.send('B')).toBe('two');
  });

  it('uses the configured default timeout', async () => {
    const { c } = await connected(() => null, 30);
    const start = Date.now();
    await expect(c.send('010C')).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('continues with the next command after a timeout', async () => {
    const { c } = await connected((cmd) => (cmd === 'SLOW' ? null : ['OK>']), 30);
    await expect(c.send('SLOW')).rejects.toBeInstanceOf(OBDError);
    await expect(c.send('ATI')).resolves.toBe('OK');
  });
});

/**
 * Adapter whose replies are delivered at explicit times (ms after the write),
 * to model an ECU that answers after the host-side timeout.
 */
class TimedTransport implements Transport {
  readonly label = 'timed';
  handlers: TransportHandlers | null = null;
  written: string[] = [];
  constructor(private reply: (cmd: string, n: number) => Array<[number, string]>) {}
  async open(h: TransportHandlers): Promise<void> {
    this.handlers = h;
  }
  write(data: string): void {
    const cmd = data.replace(/\r$/, '');
    this.written.push(cmd);
    const n = this.written.filter((w) => w === cmd).length;
    for (const [at, chunk] of this.reply(cmd, n)) {
      setTimeout(() => this.handlers?.onData(chunk), at);
    }
  }
  close(): void {}
}

describe('OBDClient resync after timeout', () => {
  it('does not hand a late reply to the next command', async () => {
    // 010C times out at 50 ms; its reply arrives at 60 ms, before 0105's
    // own reply (30 ms after its write) would.
    const t = new TimedTransport((cmd) => {
      if (cmd === '010C') return [[60, '41 0C 1A F8\r\r>']];
      if (cmd === '0105') return [[30, '41 05 82\r\r>']];
      return [[5, 'ELM327 v1.5\r\r>']];
    });
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 50 });
    await expect(c.send('010C')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(c.send('0105')).resolves.toBe('41 05 82');
    // The late reply was absorbed, so no probe was needed.
    expect(t.written).toEqual(['010C', '0105']);
  });

  it('discards a late reply split across chunks', async () => {
    const t = new TimedTransport((cmd) => {
      if (cmd === '03') return [[55, '43 01 '], [60, '33 00 00\r'], [65, '\r>']];
      return [[30, `${cmd}-OK\r>`]];
    });
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 50 });
    await expect(c.send('03')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(c.send('0101')).resolves.toBe('0101-OK');
  });

  it('probes a silent adapter and drains the probe reply', async () => {
    const t = new FakeTransport((cmd) => (cmd === 'LOST' ? null : [`${cmd}-R\r>`]));
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 30 });
    await expect(c.send('LOST')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(c.send('0105')).resolves.toBe('0105-R');
    expect(t.written).toEqual(['LOST', 'ATI', '0105']);
  });

  it('drains both prompts when the probe interrupts a busy adapter', async () => {
    // Busy adapter: the probe yields STOPPED and then the probe's own reply.
    const t = new TimedTransport((cmd) => {
      if (cmd === 'BUSY') return [];
      if (cmd === 'ATI') return [[5, 'STOPPED\r\r>'], [20, '?\r\r>']];
      return [[5, `${cmd}-R\r>`]];
    });
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 30 });
    await expect(c.send('BUSY')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(c.send('0105')).resolves.toBe('0105-R');
  });

  it('keeps trying to resync while the adapter stays silent', async () => {
    const t = new FakeTransport(() => null);
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 20 });
    await expect(c.send('A')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(c.send('B')).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(t.written).toEqual(['A', 'ATI', 'B']);
    await expect(c.send('C')).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(t.written).toEqual(['A', 'ATI', 'B', 'ATI', 'C']);
  });

  it('rejects with CONNECTION_CLOSED if the link drops during resync', async () => {
    const t = new FakeTransport(() => null);
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 40 });
    await expect(c.send('A')).rejects.toMatchObject({ code: 'TIMEOUT' });
    const p = c.send('B');
    await new Promise((r) => setTimeout(r, 10));
    t.drop();
    await expect(p).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
  });

  it('clears the stale state on disconnect', async () => {
    const t = new FakeTransport((cmd) => (cmd === 'A' ? null : ['OK>']));
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 30 });
    await expect(c.send('A')).rejects.toMatchObject({ code: 'TIMEOUT' });
    c.disconnect();
    const t2 = new FakeTransport(() => ['OK>']);
    await c.connect(t2, { timeoutMs: 30 });
    await expect(c.send('ATI')).resolves.toBe('OK');
    expect(t2.written).toEqual(['ATI']);
  });
});

describe('OBDClient recovery', () => {
  it('retries once on STOPPED', async () => {
    const { c, t } = await connected((_cmd, n) => (n === 1 ? ['STOPPED\r>'] : ['41 05 82\r>']));
    await expect(c.send('0105')).resolves.toBe('41 05 82');
    expect(t.written).toEqual(['0105', '0105']);
  });

  it('only retries STOPPED once', async () => {
    const { c, t } = await connected(() => ['STOPPED\r>']);
    await expect(c.send('0105')).resolves.toBe('STOPPED');
    expect(t.written).toHaveLength(2);
  });

  it('resends ATSP0 then retries on BUS INIT...ERROR', async () => {
    const { c, t } = await connected((cmd, n) => {
      if (cmd === 'ATSP0') return ['OK>'];
      return n === 1 ? ['BUS INIT: ...ERROR\r>'] : ['41 00 BE 3E B8 11\r>'];
    });
    await expect(c.send('0100')).resolves.toBe('41 00 BE 3E B8 11');
    expect(t.written).toEqual(['0100', 'ATSP0', '0100']);
  });

  it('skips recovery when recover: false (terminal)', async () => {
    const { c, t } = await connected(() => ['STOPPED\r>']);
    await expect(c.send('0105', { recover: false })).resolves.toBe('STOPPED');
    expect(t.written).toEqual(['0105']);
  });
});

describe('OBDClient disconnects', () => {
  it('rejects the in-flight command when the link closes', async () => {
    const { c, t } = await connected(() => null, 5000);
    const p = c.send('03');
    await new Promise((r) => setTimeout(r, 5)); // let the queued command hit the wire
    expect(t.written).toEqual(['03']);
    t.drop();
    await expect(p).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    expect(c.isConnected()).toBe(false);
  });

  it('notifies the disconnect listener on unexpected close only', async () => {
    const { c, t } = await connected(() => ['OK>']);
    const listener = jest.fn();
    c.setDisconnectListener(listener);
    t.drop();
    expect(listener).toHaveBeenCalledTimes(1);

    const second = await connected(() => ['OK>']);
    const l2 = jest.fn();
    second.c.setDisconnectListener(l2);
    second.c.disconnect();
    second.t.drop(); // late close event from the socket
    expect(l2).not.toHaveBeenCalled();
    expect(second.t.closed).toBe(true);
  });

  it('aborts a connect that is still opening when disconnect() is called', async () => {
    let finishOpen: () => void = () => {};
    const t = new FakeTransport(() => ['OK>']);
    t.open = (h) =>
      new Promise<void>((resolve) => {
        t.handlers = h;
        finishOpen = resolve;
      });
    const c = new OBDClient();
    const p = c.connect(t);
    c.disconnect();
    expect(t.closed).toBe(true);
    finishOpen();
    await expect(p).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    expect(c.isConnected()).toBe(false);
    // A fresh connect works afterwards.
    await c.connect(new FakeTransport(() => ['OK>']));
    await expect(c.send('ATI')).resolves.toBe('OK');
  });

  it('rejects queued commands after disconnect', async () => {
    const { c } = await connected(() => ['OK>']);
    c.disconnect();
    await expect(c.send('ATI')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
  });
});

describe('OBDClient init', () => {
  const base: Record<string, string> = {
    ATZ: '\r\rELM327 v1.5\r\r>',
    ATE0: 'ATE0\rOK\r\r>',
    ATL0: 'OK\r\r>',
    ATS0: 'OK\r\r>',
    ATH0: 'OK\r\r>',
    ATSP0: 'OK\r\r>',
    ATST92: 'OK\r\r>',
  };

  it('succeeds when 0100 answers', async () => {
    const { c, t } = await connected((cmd) => [base[cmd] ?? 'SEARCHING...\r4100BE3FA813\r\r>']);
    await expect(c.init()).resolves.toBeUndefined();
    expect(t.written).toEqual(['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', '0100']);
  });

  it('throws UNABLE_TO_CONNECT when the ignition is off', async () => {
    const { c } = await connected((cmd) => [base[cmd] ?? 'SEARCHING...\rUNABLE TO CONNECT\r\r>']);
    await expect(c.init()).rejects.toMatchObject({ code: 'UNABLE_TO_CONNECT' });
  });

  it('sends ATST in slow ECU mode', async () => {
    const t = new FakeTransport((cmd) => [base[cmd] ?? '4100BE3FA813\r\r>']);
    const c = new OBDClient();
    await c.connect(t, { timeoutMs: 200, slowEcu: true });
    await c.init();
    expect(t.written).toContain('ATST92');
    expect(t.written.indexOf('ATST92')).toBeLessThan(t.written.indexOf('ATSP0'));
  });
});

describe('OBDClient high-level reads', () => {
  it('readSupportedPids follows the next-bank bit', async () => {
    const replies: Record<string, string> = {
      '0100': '4100BE3FA813>', // bit for 0x20 set
      '0120': '41208005B011>', // bit for 0x40 set
      '0140': '4140FED08400>', // bit for 0x60 not set -> stop
    };
    const { c, t } = await connected((cmd) => [replies[cmd] ?? 'NO DATA>']);
    const pids = await c.readSupportedPids();
    expect(pids).toContain('0C');
    expect(pids).toContain('21');
    expect(pids).toContain('42');
    expect(t.written).toEqual(['0100', '0120', '0140']);
  });

  it('readPid maps NO DATA to unsupported', async () => {
    const { c } = await connected(() => ['NO DATA\r>']);
    await expect(c.readPid('OILT')).resolves.toMatchObject({ status: 'unsupported' });
  });

  it('readFreezeFrame reads the DTC and the supported PIDs of frame 00', async () => {
    const replies: Record<string, string> = {
      '020200': '4202000133>',
      '020000': '4200007E1F8000>', // 02-07, 0C-10, 11 ... but 02/03 are not in the registry
      '020400': '42040040>',
      '020500': '42050082>',
      '020C00': '420C001AF8>',
    };
    const { c, t } = await connected((cmd) => [replies[cmd] ?? 'NO DATA>']);
    const ff = await c.readFreezeFrame();
    expect(ff.dtc).toBe('P0133');
    expect(t.written.every((w) => w.startsWith('02') && w.endsWith('00'))).toBe(true);
    const byId = Object.fromEntries(ff.values.map((v) => [v.def.id, v.value]));
    expect(byId.ECT).toBe(90);
    expect(byId.RPM).toBe(1726);
    expect(byId.LOAD).toBeCloseTo(25.1, 1);
  });

  it('readFreezeFrame follows Mode 02 bank 20 for PIDs above 0x20', async () => {
    const replies: Record<string, string> = {
      '020200': '4202000133>',
      '020000': '42000000100001>', // 0C, and bank 20 exists
      '022000': '42200000020000>', // 2F (fuel level)
      '020C00': '420C001AF8>',
      '022F00': '422F0080>',
    };
    const { c, t } = await connected((cmd) => [replies[cmd] ?? 'NO DATA>']);
    const ff = await c.readFreezeFrame();
    const byId = Object.fromEntries(ff.values.map((v) => [v.def.id, v.value]));
    expect(byId.RPM).toBe(1726);
    expect(byId.FUEL).toBeCloseTo(50.2, 1);
    expect(t.written).toContain('022000');
    expect(t.written).not.toContain('024000');
  });

  it('readFreezeFrame returns no values when no frame is stored', async () => {
    const { c, t } = await connected(() => ['4202000000>']);
    await expect(c.readFreezeFrame()).resolves.toEqual({ frame: '00', dtc: null, values: [] });
    expect(t.written).toEqual(['020200']);
  });
});
