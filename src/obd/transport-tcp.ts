import TcpSocket from 'react-native-tcp-socket';
import type { Transport, TransportHandlers } from './transport';
import { OBDError } from './protocol';
import { NOOP_LOGGER, type DiagLogger } from './diag-log';

type Socket = ReturnType<typeof TcpSocket.createConnection>;

export type TcpTimeouts = {
  /**
   * Native connect timeout in ms. The iOS side does integer ms / 1000, so
   * values below 1000 would become 0 (no timeout); it is clamped to >= 1000.
   */
  connectTimeoutMs: number;
  /** JS backstop in case the native timeout never fires. */
  backstopMs: number;
};

/** Normal connect. */
export const TCP_CONNECT_TIMEOUTS: TcpTimeouts = { connectTimeoutMs: 8000, backstopMs: 10000 };
/** One Otomatik bul attempt. */
export const TCP_SCAN_TIMEOUTS: TcpTimeouts = { connectTimeoutMs: 2500, backstopMs: 3000 };

export type TcpTransportOptions = Partial<TcpTimeouts> & { log?: DiagLogger };

/**
 * Raw TCP link to a Wi-Fi ELM327 dongle. This is the only network code in
 * the app, and it only ever talks to the user-configured local host/port.
 */
export class TcpTransport implements Transport {
  readonly label: string;
  private socket: Socket | null = null;
  private readonly connectTimeoutMs: number;
  private readonly backstopMs: number;
  private readonly log: DiagLogger;

  constructor(
    private readonly host: string,
    private readonly port: number,
    options: TcpTransportOptions = {}
  ) {
    this.label = `${host}:${port}`;
    this.connectTimeoutMs = Math.max(1000, options.connectTimeoutMs ?? TCP_CONNECT_TIMEOUTS.connectTimeoutMs);
    this.backstopMs = options.backstopMs ?? TCP_CONNECT_TIMEOUTS.backstopMs;
    this.log = options.log ?? NOOP_LOGGER;
  }

  open(handlers: TransportHandlers): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      let settled = false;
      let closeNotified = false;
      const startedAt = Date.now();

      const notifyClose = (err?: Error) => {
        if (!opened || closeNotified) return;
        closeNotified = true;
        handlers.onClose(err);
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.close();
        reject(err);
      };

      this.log.log(
        `tcp open ${this.label} connectTimeout=${this.connectTimeoutMs}ms backstop=${this.backstopMs}ms`
      );
      const timer = setTimeout(() => {
        const raw = `Timed out connecting to ${this.label} (JS timer)`;
        this.log.log(`tcp backstop timeout after ${this.backstopMs}ms`);
        fail(new OBDError('CONNECT_FAILED', raw, { step: 'tcp', raw }));
      }, this.backstopMs);

      try {
        const sock = TcpSocket.createConnection(
          {
            host: this.host,
            port: this.port,
            connectTimeout: this.connectTimeoutMs,
            // Android only; iOS ignores it.
            interface: 'wifi',
          },
          () => {
            if (settled) return;
            settled = true;
            opened = true;
            clearTimeout(timer);
            this.log.log(
              `tcp connected in ${Date.now() - startedAt}ms local=${sock.localAddress ?? '?'}:${sock.localPort ?? '?'} ` +
                `remote=${sock.remoteAddress ?? '?'}:${sock.remotePort ?? '?'}`
            );
            resolve();
          }
        );
        this.socket = sock;
        // ELM327 output is ASCII. latin1 maps every byte to one char, so a
        // stray high byte from a clone or a chunk boundary cannot turn into
        // U+FFFD and swallow neighbouring characters (as utf8 could).
        sock.setEncoding('latin1');
        sock.on('data', (data: Buffer | string) => {
          handlers.onData(typeof data === 'string' ? data : data.toString('latin1'));
        });
        // The iOS native side emits the error as a plain string, not an Error.
        sock.on('error', (payload: unknown) => {
          const msg = payload instanceof Error ? payload.message : String(payload);
          this.log.log(`tcp error (native) after ${Date.now() - startedAt}ms: ${msg}`);
          if (!opened) fail(new OBDError('CONNECT_FAILED', msg, { step: 'tcp', raw: msg }));
          else notifyClose(new Error(msg));
        });
        sock.on('close', () => {
          this.log.log(`tcp close after ${Date.now() - startedAt}ms`);
          if (this.socket === sock) this.socket = null;
          if (!opened) {
            const raw = `Connection to ${this.label} closed`;
            fail(new OBDError('CONNECT_FAILED', raw, { step: 'tcp', raw }));
          } else notifyClose();
        });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        this.log.log(`tcp createConnection threw: ${raw}`);
        fail(new OBDError('CONNECT_FAILED', raw, { step: 'tcp', raw }));
      }
    });
  }

  write(data: string): void {
    if (!this.socket) throw new OBDError('NOT_CONNECTED', 'Socket is not open');
    this.socket.write(data);
  }

  close(): void {
    const s = this.socket;
    this.socket = null;
    try {
      s?.destroy();
    } catch {
      // ignore
    }
  }
}
