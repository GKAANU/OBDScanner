import { EventEmitter } from 'events';

type FakeSocket = EventEmitter & {
  options: Record<string, unknown>;
  onConnect: () => void;
  localAddress?: string;
  localPort?: number;
  remoteAddress?: string;
  remotePort?: number;
  written: string[];
  destroyed: boolean;
  setEncoding: (e: string) => void;
  write: (d: string) => void;
  destroy: () => void;
};

const sockets: FakeSocket[] = [];

jest.mock('react-native-tcp-socket', () => ({
  __esModule: true,
  default: {
    createConnection: (options: Record<string, unknown>, onConnect: () => void) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EventEmitter: EE } = require('events');
      const s = new EE() as FakeSocket;
      s.options = options;
      s.onConnect = onConnect;
      s.written = [];
      s.destroyed = false;
      s.setEncoding = () => {};
      s.write = (d: string) => s.written.push(d);
      s.destroy = () => {
        s.destroyed = true;
      };
      sockets.push(s);
      return s;
    },
  },
}));

import { TcpTransport } from './transport-tcp';
import { DiagLog } from './diag-log';

const handlers = () => ({ onData: jest.fn(), onClose: jest.fn() });

beforeEach(() => {
  sockets.length = 0;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('TcpTransport', () => {
  it('passes the native connectTimeout (8000 ms) and the wifi interface hint', async () => {
    const t = new TcpTransport('192.168.0.10', 35000);
    const p = t.open(handlers());
    expect(sockets[0].options).toMatchObject({
      host: '192.168.0.10',
      port: 35000,
      connectTimeout: 8000,
      interface: 'wifi',
    });
    sockets[0].onConnect();
    await expect(p).resolves.toBeUndefined();
  });

  it('JS backstop rejects at 10000 ms, not before', async () => {
    const t = new TcpTransport('192.168.0.10', 35000);
    const p = t.open(handlers());
    let settled = false;
    p.catch(() => {}).finally(() => (settled = true));
    await jest.advanceTimersByTimeAsync(9999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(p).rejects.toMatchObject({ code: 'CONNECT_FAILED', step: 'tcp' });
    expect(sockets[0].destroyed).toBe(true);
  });

  it('timeouts are configurable per transport and clamped to >= 1000 ms natively', async () => {
    const t = new TcpTransport('10.10.100.254', 8899, { connectTimeoutMs: 500, backstopMs: 3000 });
    const p = t.open(handlers());
    expect(sockets[0].options.connectTimeout).toBe(1000);
    const done = expect(p).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    await jest.advanceTimersByTimeAsync(3000);
    await done;
  });

  it('keeps the raw iOS error string', async () => {
    const t = new TcpTransport('192.168.0.10', 35000);
    const p = t.open(handlers());
    sockets[0].emit('error', 'No route to host');
    await expect(p).rejects.toMatchObject({ code: 'CONNECT_FAILED', step: 'tcp', raw: 'No route to host' });
  });

  it('logs open, connect addresses and close', async () => {
    const log = new DiagLog();
    const h = handlers();
    const t = new TcpTransport('192.168.0.10', 35000, { log });
    const p = t.open(h);
    Object.assign(sockets[0], { localAddress: '192.168.0.11', localPort: 50123, remoteAddress: '192.168.0.10', remotePort: 35000 });
    sockets[0].onConnect();
    await p;
    sockets[0].emit('close');
    const lines = log.entries().map((e) => e.text);
    expect(lines[0]).toBe('tcp open 192.168.0.10:35000 connectTimeout=8000ms backstop=10000ms');
    expect(lines[1]).toMatch(/^tcp connected in \d+ms local=192\.168\.0\.11:50123 remote=192\.168\.0\.10:35000$/);
    expect(lines[2]).toMatch(/^tcp close/);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
